import { StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { divertCandidates, knotAt, scanDiverts, scanKnots } from '@shared/inkKnots'

/**
 * The two directions a knot name can be followed in the editor.
 *
 * A **header** answers "how does the reader ever get *to* this ending?" — the
 * route is spread across choices in other knots, and reading backwards through
 * diverts is precisely the work this tool exists to remove. Following one hands
 * the question to the manuscript's path search.
 *
 * A **divert** is the opposite question, and the ordinary one: "where does this
 * go?" Following one is go-to-definition, and lands on the knot itself.
 *
 * Both are Ctrl-click. A plain click has to keep placing the caret, or neither
 * the header nor the divert could be edited, which is also how codex mentions
 * behave in this same editor.
 */

const HEADER_CLASS = 'cm-knot-link'
const DIVERT_CLASS = 'cm-divert-link'

function buildLinks(state: EditorState): DecorationSet {
  const source = state.doc.toString()
  // The same scan the plan uses to tell whether a chapter's knot exists in the
  // ink attached to it, so the two can never disagree about what a knot is.
  const knots = scanKnots(source).filter((knot) => !knot.isFunction)
  const inFile = new Set(knots.map((knot) => knot.name))

  const marks = knots
    .filter((knot) => knot.line <= state.doc.lines)
    .map((knot) => {
      const from = state.doc.line(knot.line).from + knot.column
      return {
        from,
        to: from + knot.title.length,
        target: knot.name,
        header: true
      }
    })

  for (const divert of scanDiverts(source)) {
    if (divert.line > state.doc.lines) continue
    // Qualified here when this file declares it, so a bare `-> ending` inside
    // `chapter_one` is handed on as `chapter_one.ending` rather than as a name
    // the project search would match against somebody else's ending.
    //
    // Every target is underlined, including the ones this file cannot resolve:
    // most diverts lead to another file, and a name that resolves nowhere at
    // all is a compile error the Debug tab already reports. `onGoTo` searches
    // the project and says so when there is nothing to open.
    const resolved = divertCandidates(divert.target, knotAt(source, divert.line)).find((name) =>
      inFile.has(name)
    )
    const from = state.doc.line(divert.line).from + divert.column
    marks.push({
      from,
      to: from + divert.target.length,
      target: resolved ?? divert.target,
      header: false
    })
  }

  return Decoration.set(
    marks.map((mark) =>
      Decoration.mark({
        class: mark.header ? HEADER_CLASS : DIVERT_CLASS,
        attributes: {
          'data-knot': mark.target,
          title: mark.header
            ? `Ctrl-click to trace a path to ${mark.target} in the manuscript`
            : `Ctrl-click to go to ${mark.target}`
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
 * A header is drawn in the colour of the thing it leads to — knot headers are
 * `--syntax-heading`, and the underline names a destination the reader can see
 * above it. A divert is drawn on `--syntax-link`, the branch hue the design
 * system gives `->` in source, because that is what it is.
 */
const knotLinkTheme = EditorView.baseTheme({
  [`.${HEADER_CLASS}, .${DIVERT_CLASS}`]: {
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationStyle: 'dashed',
    textUnderlineOffset: '4px'
  },
  [`.${HEADER_CLASS}`]: {
    textDecorationColor: 'color-mix(in oklab, var(--syntax-heading) 55%, transparent)'
  },
  [`.${DIVERT_CLASS}`]: {
    textDecorationColor: 'color-mix(in oklab, var(--syntax-link) 55%, transparent)'
  },
  [`.${HEADER_CLASS}:hover, .${DIVERT_CLASS}:hover`]: {
    backgroundColor: 'var(--accent-signal-quiet)',
    textDecorationStyle: 'solid'
  }
})

/**
 * `onFollow` and `onGoTo` are read through callbacks because the editor is
 * built once and must not be torn down when React re-renders.
 */
export function knotLinks(
  onFollow: (knot: string) => void,
  onGoTo: (knot: string) => void
): Extension {
  return [
    knotLinkField,
    knotLinkTheme,
    EditorView.domEventHandlers({
      mousedown(event) {
        if (!(event.ctrlKey || event.metaKey)) return false
        const target = event.target as HTMLElement | null
        const link = target?.closest?.(`.${HEADER_CLASS}, .${DIVERT_CLASS}`)
        const knot = link?.getAttribute('data-knot')
        if (!knot) return false

        event.preventDefault()
        if (link!.classList.contains(HEADER_CLASS)) onFollow(knot)
        else onGoTo(knot)
        return true
      }
    })
  ]
}
