import { StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { scanKnots } from '@shared/inkKnots'

/**
 * Knot and stitch headers as links into the manuscript.
 *
 * "How does the reader ever get to this ending?" is the question an ink file is
 * worst at answering — the route is spread across choices in other knots, and
 * reading backwards through diverts is precisely the work this tool exists to
 * remove. Following the header hands the question to the path search instead.
 */

function buildLinks(state: EditorState): DecorationSet {
  // The same scan the plan uses to tell whether a chapter's knot exists in the
  // ink attached to it, so the two can never disagree about what a knot is.
  const marks = scanKnots(state.doc.toString())
    .filter((knot) => !knot.isFunction && knot.line <= state.doc.lines)
    .map((knot) => {
      const from = state.doc.line(knot.line).from + knot.column
      return { from, to: from + knot.title.length, target: knot.name }
    })

  return Decoration.set(
    marks.map((mark) =>
      Decoration.mark({
        class: 'cm-knot-link',
        attributes: {
          'data-knot': mark.target,
          title: `Ctrl-click to trace a path to ${mark.target} in the manuscript`
        }
      }).range(mark.from, mark.to)
    ),
    true
  )
}

const knotLinkField = StateField.define<DecorationSet>({
  create: (state) => buildLinks(state),
  update: (links, transaction) =>
    transaction.docChanged ? buildLinks(transaction.state) : links,
  provide: (field) => EditorView.decorations.from(field)
})

/**
 * Knot headers are `--syntax-heading`, so a link to one is drawn in the same
 * colour it leads to. The design system would otherwise put diverts on
 * `--syntax-link` (the branch hue); that is right for `->` in source, and wrong
 * here, where the underline names a destination the reader can see above it.
 */
const knotLinkTheme = EditorView.baseTheme({
  '.cm-knot-link': {
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationStyle: 'dashed',
    textDecorationColor: 'color-mix(in oklab, var(--syntax-heading) 55%, transparent)',
    textUnderlineOffset: '4px'
  },
  '.cm-knot-link:hover': {
    backgroundColor: 'var(--accent-signal-quiet)',
    textDecorationStyle: 'solid'
  }
})

/**
 * `onFollow` is read through a callback because the editor is built once and
 * must not be torn down when React re-renders.
 */
export function knotLinks(onFollow: (knot: string) => void): Extension {
  return [
    knotLinkField,
    knotLinkTheme,
    EditorView.domEventHandlers({
      mousedown(event) {
        const target = event.target as HTMLElement | null
        const knot = target?.closest?.('.cm-knot-link')?.getAttribute('data-knot')
        // Modified click only: a plain click has to keep placing the cursor, or
        // the header could not be edited. This matches codex mentions in the
        // same editor, and go-to-definition everywhere else.
        if (!knot || !(event.ctrlKey || event.metaKey)) return false
        event.preventDefault()
        onFollow(knot)
        return true
      }
    })
  ]
}
