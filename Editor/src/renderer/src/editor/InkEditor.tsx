import { useEffect, useRef, useState } from 'react'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { search } from '@codemirror/search'
import { basicSetup } from 'codemirror'
import type { Mention } from '@shared/mentions'
import type { TagCatalogues } from '@shared/tagSuggest'
import type { InkDiagnostic } from '@shared/types'
import { ink } from './inkLanguage'
import { InkOutline } from './InkOutline'
import { knotLinks } from './knotLinks'
import { scanKnots } from '@shared/inkKnots'
import { codexMentions, setMentions } from './mentionHighlight'
import { setTagCatalogues, tagComplete } from './tagComplete'
import { canApplyGuardedEdit, type GuardedTextEdit } from './guardedEdit'

interface InkEditorProps {
  value: string
  onChange: (value: string) => void
  diagnostics: InkDiagnostic[]
  /** Diagnostics from INCLUDEd files are hidden; only this file's are shown. */
  filePath: string | null
  mentions: Mention[]
  /**
   * What a `#` tag may name: the pictures, the stats, the cast.
   *
   * Passed in rather than read here, because the editor does not own them —
   * and the menu offering a background that is not in the catalogue would be
   * worse than offering nothing at all.
   */
  catalogues: TagCatalogues
  onOpenEntry: (entryId: string) => void
  /** Ctrl-clicking a knot header traces a path to it in the manuscript. */
  onFollowKnot: (knot: string) => void
  /**
   * Scrolls to a line and selects it. The nonce lets the same line be requested
   * twice — jumping back to where you already were should still move the view.
   */
  gotoLine?: { line: number; nonce: number; align?: 'center' | 'start' } | null
  /**
   * Puts text in at the cursor, over the selection when there is one. Nonced
   * like `gotoLine`, so the same draft can be inserted twice.
   */
  insert?: { text: string; nonce: number } | null
  /** The selected text, for a panel that wants to act on it. */
  onSelectionChange?: (selection: string) => void
  /**
   * The knot or stitch the cursor is inside, or null above the first one.
   *
   * Fires only when it changes, not on every keystroke: whoever is listening
   * restarts something when it does, and doing that per character typed would
   * be unusable.
   */
  onKnotChange?: (knot: string | null) => void
  /**
   * A range replacement to apply as one transaction, so undo takes it back in
   * one step. It carries the source snapshot and file it was calculated from,
   * so an old character range is never replayed against different prose.
   */
  edit?: GuardedTextEdit | null
  /** Marks a one-shot edit consumed, whether it was applied or refused as stale. */
  onEditHandled?: (nonce: number) => void
  /**
   * Right-click, with the document offset under the pointer. The editor reports
   * where rather than deciding what, so the menu owns every decision about it.
   */
  onContextMenu?: (at: { offset: number; x: number; y: number }) => void
}

/**
 * The editor's chrome, drawn from the same tokens as the rest of the window —
 * this surface and the interface had separate palettes until now.
 *
 * `dark: true` stays a literal: CodeMirror reads it to decide which registered
 * theme applies, so it cannot be a custom property. It only reaches the chrome
 * basicSetup draws itself (lint tooltip, search panel, autocomplete); every
 * surface below is set explicitly.
 */
/**
 * Find-and-replace, opened above the document rather than below it.
 *
 * `basicSetup` ships the search *keymap* but never calls `search()`, so the
 * panel takes the library default and mounts at the bottom — the far end of a
 * file from the line being read, and on a long ink file a long way from the
 * caret it just moved. Exported like the theme so the editor and its test
 * configure the same panel rather than two that resemble each other.
 */
export const editorSearch = search({ top: true })

export const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: 'var(--text-md)',
      backgroundColor: 'var(--surface-canvas)'
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      // Looser than the UI: ink source is read as prose as much as as code.
      lineHeight: '1.7'
    },
    '.cm-content': { caretColor: 'var(--text-accent)' },
    // One step up from the canvas, so the margin reads as separate without a rule.
    '.cm-gutters': {
      backgroundColor: 'var(--surface-pane)',
      color: 'var(--syntax-gutter)',
      border: 'none'
    },
    '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--editor-active-line)',
      color: 'var(--text-tertiary)'
    },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--text-accent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--selection-bg)'
    },
    // basicSetup otherwise paints every duplicate of selected text bright
    // green. For tags that makes a valid line look like the deletion target;
    // the actual selection already has the unambiguous layer above.
    '.cm-selectionMatch': {
      backgroundColor: 'transparent'
    }
  },
  { dark: true }
)

/**
 * Maps compiler diagnostics onto document offsets. ink reports 1-based line
 * numbers with no column, so a diagnostic highlights its whole line.
 */
function toEditorDiagnostics(
  state: EditorState,
  diagnostics: InkDiagnostic[],
  filePath: string | null
): Diagnostic[] {
  return diagnostics
    .filter((d) => d.line !== null && (d.file === null || d.file === filePath))
    .flatMap((d) => {
      // Guard against a stale diagnostic pointing past the end of an edited doc.
      if (d.line === null || d.line < 1 || d.line > state.doc.lines) return []
      const line = state.doc.line(d.line)
      return [
        {
          from: line.from,
          to: line.to,
          severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
          message: d.message
        } satisfies Diagnostic
      ]
    })
}

/**
 * Marks a transaction as "the value prop changed", not "somebody typed".
 *
 * The two are indistinguishable to a document listener otherwise, and treating
 * a sync as an edit marks a file dirty the moment it is reloaded from disk.
 */
const fromProps = Annotation.define<boolean>()

/**
 * Scrolls a line into view and selects it.
 *
 * Shared by the outline and by `gotoLine` so they arrive the same way: the
 * selection is what makes the jump visible, since scrolling alone leaves an
 * author looking at a screen of text with no mark saying which line they asked
 * for.
 *
 * Centred by default, so the lines around it — the tag block under a knot
 * header — come along. A search result asks for `start` instead: there the
 * author is reading forward from the hit, and what matters is the prose after
 * it rather than the context before. Neither can scroll past the end of the
 * document, so a match in the last few lines simply lands as high as it can.
 */
function reveal(view: EditorView, at: number, align: 'center' | 'start' = 'center'): void {
  // The document may still be the previous file for a frame after switching.
  if (at < 1 || at > view.state.doc.lines) return

  const line = view.state.doc.line(at)
  view.dispatch({
    selection: { anchor: line.from, head: line.to },
    effects: EditorView.scrollIntoView(line.from, { y: align })
  })
  view.focus()
}

/** The innermost section a line sits in — a stitch before the knot holding it. */
function knotAt(source: string, line: number): string | null {
  const found = scanKnots(source).filter((knot) => !knot.isFunction && knot.line <= line)
  return found.length > 0 ? found[found.length - 1]!.name : null
}

export function InkEditor({
  value,
  onChange,
  diagnostics,
  filePath,
  mentions,
  catalogues,
  onOpenEntry,
  onFollowKnot,
  gotoLine = null,
  insert = null,
  edit = null,
  onEditHandled,
  onSelectionChange,
  onKnotChange,
  onContextMenu
}: InkEditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Held in refs so the editor is created once and never torn down on re-render,
  // which would lose cursor position, undo history and scroll state.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onOpenEntryRef = useRef(onOpenEntry)
  onOpenEntryRef.current = onOpenEntry
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange
  const onKnotChangeRef = useRef(onKnotChange)
  onKnotChangeRef.current = onKnotChange
  /** What was last reported, so an unchanged answer is not reported again. */
  const lastKnot = useRef<string | null>(null)
  const lastLine = useRef(0)
  /**
   * The same answer as `lastKnot`, kept as state for the outline to mark.
   *
   * Both, rather than one: the ref is what the update listener compares against
   * without re-rendering on every keystroke, and the state is what re-renders
   * the outline on the far rarer occasion that the answer actually changed.
   */
  const [here, setHere] = useState<string | null>(null)
  const onContextMenuRef = useRef(onContextMenu)
  onContextMenuRef.current = onContextMenu
  const onEditHandledRef = useRef(onEditHandled)
  onEditHandledRef.current = onEditHandled
  const onFollowKnotRef = useRef(onFollowKnot)
  onFollowKnotRef.current = onFollowKnot

  useEffect(() => {
    if (!hostRef.current) return

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          editorSearch,
          keymap.of([indentWithTab]),
          ink(),
          tagComplete(),
          codexMentions((entryId) => onOpenEntryRef.current(entryId)),
          knotLinks((knot) => onFollowKnotRef.current(knot)),
          editorTheme,
          EditorView.lineWrapping,
          EditorView.domEventHandlers({
            contextmenu(event, view) {
              if (!onContextMenuRef.current) return false
              const offset = view.posAtCoords({ x: event.clientX, y: event.clientY })
              if (offset === null) return false

              event.preventDefault()
              // Moved there first, so the menu acts where the pointer is rather
              // than wherever the caret happened to be left.
              view.dispatch({ selection: { anchor: offset } })
              onContextMenuRef.current({ offset, x: event.clientX, y: event.clientY })
              return true
            }
          }),
          EditorView.updateListener.of((update) => {
            const synced = update.transactions.some((one) => one.annotation(fromProps))
            if (update.docChanged && !synced) onChangeRef.current(update.state.doc.toString())
            if (update.docChanged || update.selectionSet) {
              const { from, to } = update.state.selection.main
              onSelectionChangeRef.current?.(from === to ? '' : update.state.sliceDoc(from, to))

              // Rescanned only when the line moved or the text changed —
              // arrowing along one line does not change which knot it is in.
              const line = update.state.doc.lineAt(from).number
              if (update.docChanged || line !== lastLine.current) {
                lastLine.current = line
                const found = knotAt(update.state.doc.toString(), line)
                if (found !== lastKnot.current) {
                  lastKnot.current = found
                  setHere(found)
                  onKnotChangeRef.current?.(found)
                }
              }
            }
          })
        ]
      })
    })

    viewRef.current = view
    // The caret begins at the top without emitting a selection transaction.
    // Report that position now so an immediate external preview does not carry
    // a knot left over from the previous file.
    const line = view.state.doc.lineAt(view.state.selection.main.from).number
    const found = knotAt(view.state.doc.toString(), line)
    lastLine.current = line
    if (found !== lastKnot.current) {
      lastKnot.current = found
      setHere(found)
      onKnotChangeRef.current?.(found)
    }
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Intentionally empty: the editor owns its document after creation, and
    // external value changes are pushed in by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push in values that came from outside the editor (opening a file, AI edits).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() !== value) {
      // Annotated so the update listener can tell this from typing. Without it,
      // replacing the buffer from outside — reloading a file another operation
      // rewrote — reported an edit and left the document falsely dirty.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: fromProps.of(true)
      })
    }

    // A different file means a different set of sections, and the cursor lands
    // at the top without moving. Derive it explicitly rather than clearing it:
    // a file whose first line is a knot is already a valid preview target.
    const line = view.state.doc.lineAt(view.state.selection.main.from).number
    const found = knotAt(view.state.doc.toString(), line)
    lastLine.current = line
    if (found !== lastKnot.current) {
      lastKnot.current = found
      setHere(found)
      onKnotChangeRef.current?.(found)
    }
  }, [value, filePath])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch(setDiagnostics(view.state, toEditorDiagnostics(view.state, diagnostics, filePath)))
  }, [diagnostics, filePath])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setMentions.of(mentions) })
  }, [mentions])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setTagCatalogues.of(catalogues) })
  }, [catalogues])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !gotoLine) return
    reveal(view, gotoLine.line, gotoLine.align)
  }, [gotoLine])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !insert) return

    // replaceSelection is exactly the behaviour wanted: over the selection when
    // there is one, at the cursor when there is not.
    view.dispatch(view.state.replaceSelection(insert.text))
    view.focus()
  }, [insert])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !edit) return
    const current = view.state.doc.toString()
    if (!canApplyGuardedEdit(edit, current, filePath)) {
      onEditHandledRef.current?.(edit.nonce)
      return
    }

    const at = edit.from + (edit.cursor ?? edit.insert.length)
    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: { anchor: Math.min(at, view.state.doc.length + edit.insert.length) },
      scrollIntoView: true
    })
    view.focus()
    onEditHandledRef.current?.(edit.nonce)
  }, [edit, filePath])

  return (
    <div className="editor-body">
      {/* Given `value` rather than the view's own document: the two are the
          same text, and reading the prop keeps the outline a plain function of
          what was passed in rather than something needing to be told when to
          look again. */}
      <InkOutline
        source={value}
        here={here}
        onGo={(line) => {
          const view = viewRef.current
          if (view) reveal(view, line)
        }}
      />

      <div className="editor-host" ref={hostRef} />
    </div>
  )
}
