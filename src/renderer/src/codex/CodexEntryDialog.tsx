import { useEffect, useRef, useState } from 'react'
import type { CodexEntry } from '@shared/codex'
import { CodexEntryEditor } from './CodexEntryEditor'
import { Button, Dialog, DialogSpacer, Icon, IconButton, Input } from '../design/components'

interface CodexEntryDialogProps {
  entry: CodexEntry
  entries: CodexEntry[]
  libraryTitle: string
  mentionCount: number
  onSave: (entry: CodexEntry) => Promise<string | null>
  onDelete: (entry: CodexEntry) => Promise<void>
  onMove: (entry: CodexEntry, toFile: string) => void
  onClose: () => void
}

type TextControl = HTMLInputElement | HTMLTextAreaElement

function occurrences(value: string, query: string): Array<{ from: number; to: number }> {
  if (query.length === 0) return []
  const haystack = value.toLocaleLowerCase()
  const needle = query.toLocaleLowerCase()
  const found: Array<{ from: number; to: number }> = []
  for (let from = haystack.indexOf(needle); from >= 0; from = haystack.indexOf(needle, from + needle.length)) {
    found.push({ from, to: from + query.length })
  }
  return found
}

/**
 * Editing an entry, in a dialog rather than a side pane.
 *
 * The pane it used to live in only exists in the editor view, so choosing an
 * entry while reading the manuscript set state that rendered nothing at all. An
 * overlay belongs to the window rather than to one layout, and the codex is
 * equally relevant to both.
 *
 * Edits are held as a draft and written on Save, so backing out of a change is
 * possible — everything else in the app autosaves, but a codex entry is a
 * document the author deliberately composes.
 */
export function CodexEntryDialog({
  entry,
  entries,
  libraryTitle,
  mentionCount,
  onSave,
  onDelete,
  onMove,
  onClose
}: CodexEntryDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState(entry)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const findInput = useRef<HTMLInputElement>(null)
  const findTarget = useRef<TextControl | null>(null)

  useEffect(() => {
    setDraft(entry)
    setError(null)
  }, [entry.id])

  const dirty = JSON.stringify(draft) !== JSON.stringify(entry)

  const save = async (): Promise<void> => {
    setSaving(true)
    const failure = await onSave(draft)
    setSaving(false)
    setError(failure)
    if (!failure) onClose()
  }

  const close = (): void => {
    if (dirty && !window.confirm('Discard the changes to this entry?')) return
    onClose()
  }

  const remove = async (): Promise<void> => {
    if (!window.confirm(`Delete "${draft.name}"? Its file and relations to it will be removed.`)) {
      return
    }
    setDeleting(true)
    await onDelete(draft)
    setDeleting(false)
    onClose()
  }

  const matches = occurrences(findTarget.current?.value ?? '', findText)
  const activeMatch = matches.length === 0 ? 0 : ((findIndex % matches.length) + matches.length) % matches.length

  const closeFind = (): void => {
    setFindOpen(false)
    window.requestAnimationFrame(() => findTarget.current?.focus({ preventScroll: true }))
  }

  useEffect(() => {
    if (!findOpen) return
    const target = findTarget.current
    const match = matches[activeMatch]
    if (!target || !match) return

    // Briefly focus the field so Chromium scrolls a long textarea to the
    // selection, then return to the query so typing can continue.
    target.focus({ preventScroll: true })
    target.setSelectionRange(match.from, match.to)
    findInput.current?.focus({ preventScroll: true })
    // A draft edit also re-renders this dialog, but must not run this effect:
    // doing so pulled focus back to Find after every character typed into the
    // description and made the field look broken while the find bar was open.
  }, [findOpen, findText, activeMatch])

  useEffect(() => {
    const openFind = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return
      const root = document.querySelector('.entry-dialog')
      if (!root) return

      const focused = document.activeElement
      const active =
        (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) &&
        focused !== findInput.current &&
        root.contains(focused)
          ? focused
          : null
      const fallback = root.querySelector<TextControl>('[data-codex-find="description"]')
      const target = active ?? fallback
      if (!target) return

      event.preventDefault()
      event.stopImmediatePropagation()
      findTarget.current = target
      const selected = target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0)
      if (selected.length > 0 && !selected.includes('\n')) setFindText(selected)
      setFindIndex(0)
      setFindOpen(true)
      window.requestAnimationFrame(() => {
        findInput.current?.focus({ preventScroll: true })
        findInput.current?.select()
      })
    }

    window.addEventListener('keydown', openFind)
    return () => window.removeEventListener('keydown', openFind)
  }, [])

  // Escape is Dialog's; Ctrl+S is this dialog's own.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        event.stopPropagation()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <Dialog
      title={
        <>
          Codex entry
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </>
      }
      ariaLabel={`Codex entry: ${entry.name}`}
      className="entry-dialog"
      onClose={close}
      footer={
        <>
          <Button variant="danger" onClick={() => void remove()} disabled={saving || deleting}>
            <Icon name="trash-2" size={13} />
            {deleting ? 'Deleting…' : 'Delete entry'}
          </Button>
          <DialogSpacer />
          <Button onClick={close} disabled={deleting}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || deleting || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      {error && <p className="codex-error">{error}</p>}

      {findOpen && (
        <div className="codex-find" role="search" aria-label="Find in codex field">
          <Input
            ref={findInput}
            value={findText}
            aria-label="Find"
            placeholder="Find in field…"
            onChange={(event) => {
              setFindText(event.target.value)
              setFindIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                setFindIndex((current) => current + (event.shiftKey ? -1 : 1))
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                event.nativeEvent.stopImmediatePropagation()
                closeFind()
              }
            }}
          />
          <span className="codex-find__count" aria-live="polite">
            {findText.length === 0
              ? 'Type to find'
              : matches.length === 0
                ? 'No matches'
                : `${activeMatch + 1} of ${matches.length}`}
          </span>
          <IconButton
            icon="chevron-up"
            label="Previous match"
            size="sm"
            disabled={matches.length === 0}
            onClick={() => setFindIndex((current) => current - 1)}
          />
          <IconButton
            icon="chevron-down"
            label="Next match"
            size="sm"
            disabled={matches.length === 0}
            onClick={() => setFindIndex((current) => current + 1)}
          />
          <IconButton icon="x" label="Close find" size="sm" onClick={closeFind} />
        </div>
      )}

      <CodexEntryEditor
        entry={draft}
        entries={entries}
        libraryTitle={libraryTitle}
        mentionCount={mentionCount}
        onChange={setDraft}
        onMove={(target, toFile) => {
          // Moving renames the file, so anything unsaved has to land first or
          // it would be written back under the old name.
          void onSave(draft).then(() => onMove(target, toFile))
        }}
      />
    </Dialog>
  )
}
