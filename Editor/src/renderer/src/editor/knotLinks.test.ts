// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { knotLinks } from './knotLinks'

/**
 * Following a knot name, in both directions.
 *
 * A header asks how the reader gets here and goes to the manuscript; a divert
 * asks where this goes and lands on the knot. They look alike and must not be
 * confused for one another, which is most of what is checked here — that, and
 * a plain click still placing the caret, because a link you cannot edit is
 * worse than no link.
 */

let view: EditorView | null = null

afterEach(() => {
  view?.destroy()
  view = null
})

function editor(doc: string) {
  const onFollow = vi.fn()
  const onGoTo = vi.fn()
  const parent = document.createElement('div')
  document.body.append(parent)

  view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: [knotLinks(onFollow, onGoTo)] })
  })

  return { parent, onFollow, onGoTo }
}

const click = (element: Element, ctrl = true): void => {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey: ctrl }))
}

const links = (parent: HTMLElement, selector: string): HTMLElement[] => [
  ...parent.querySelectorAll<HTMLElement>(selector)
]

describe('knotLinks', () => {
  it('underlines a divert target, and only the name', () => {
    const { parent } = editor('=== town ===\n-> harbour\n')

    const [divert] = links(parent, '.cm-divert-link')
    expect(divert?.textContent).toBe('harbour')
    expect(divert?.getAttribute('title')).toBe('Ctrl-click to go to harbour')
  })

  it('sends a divert to go-to-knot and a header to the manuscript', () => {
    const { parent, onFollow, onGoTo } = editor('=== town ===\n-> harbour\n')

    click(links(parent, '.cm-divert-link')[0]!)
    expect(onGoTo).toHaveBeenCalledWith('harbour')
    expect(onFollow).not.toHaveBeenCalled()

    click(links(parent, '.cm-knot-link')[0]!)
    expect(onFollow).toHaveBeenCalledWith('town')
    expect(onGoTo).toHaveBeenCalledTimes(1)
  })

  // Ink resolves the innermost scope first, so a bare name inside a knot that
  // declares that stitch means the stitch — not somebody else's knot.
  it('qualifies a bare stitch name with the knot it is written in', () => {
    const { parent, onGoTo } = editor(
      ['=== town ===', '-> market', '= market', 'Stalls.', '=== market ===', 'Elsewhere.'].join('\n')
    )

    click(links(parent, '.cm-divert-link')[0]!)

    expect(onGoTo).toHaveBeenCalledWith('town.market')
  })

  it('passes on a name this file does not declare, for the project to resolve', () => {
    const { parent, onGoTo } = editor('=== town ===\n-> another_file_knot\n')

    click(links(parent, '.cm-divert-link')[0]!)

    expect(onGoTo).toHaveBeenCalledWith('another_file_knot')
  })

  it('leaves a plain click to place the caret', () => {
    const { parent, onFollow, onGoTo } = editor('=== town ===\n-> harbour\n')

    click(links(parent, '.cm-divert-link')[0]!, false)
    click(links(parent, '.cm-knot-link')[0]!, false)

    expect(onGoTo).not.toHaveBeenCalled()
    expect(onFollow).not.toHaveBeenCalled()
  })

  it('draws no link for a tunnel return or a reserved ending', () => {
    const { parent } = editor('=== town ===\n-> END\n->->\n-> DONE\n')

    expect(links(parent, '.cm-divert-link')).toHaveLength(0)
  })

  it('follows the document as it is edited', () => {
    const { parent } = editor('=== town ===\n')
    expect(links(parent, '.cm-divert-link')).toHaveLength(0)

    view!.dispatch({ changes: { from: view!.state.doc.length, insert: '-> harbour\n' } })

    expect(links(parent, '.cm-divert-link').map((one) => one.textContent)).toEqual(['harbour'])
  })
})
