// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { emptyMedia } from '@shared/mediaDoc'
import { emptyStats } from '@shared/statsDoc'
import { emptyNpcs } from '@shared/bundle/npcDoc'
import type { TagCatalogues } from '@shared/tagSuggest'
import { InkEditor } from './InkEditor'

const CATALOGUES: TagCatalogues = {
  media: emptyMedia(),
  stats: emptyStats(),
  npcs: emptyNpcs()
}

const SOURCE = ['=== arrival ===', '# bg: harbour', '# char: wren/happy', 'The boats are in.'].join(
  '\n'
)

/** `gotoLine` is the one way to move the caret from outside the component. */
function editor(
  onCursorLine: (line: number) => void,
  onKnotChange: (knot: string | null) => void,
  gotoLine: { line: number; nonce: number } | null
): React.JSX.Element {
  return (
    <InkEditor
      value={SOURCE}
      onChange={() => {}}
      diagnostics={[]}
      filePath="/p/arrival.ink"
      mentions={[]}
      catalogues={CATALOGUES}
      onOpenEntry={() => {}}
      onFollowKnot={() => {}}
      onGoToKnot={() => {}}
      gotoLine={gotoLine}
      onCursorLine={onCursorLine}
      onKnotChange={onKnotChange}
    />
  )
}

/**
 * The preview reads the staging down to the caret, so it needs the line and not
 * just the knot: moving from the header to the line under a `# bg:` changes what
 * it draws without changing which knot the caret is in.
 */
describe('InkEditor onCursorLine', () => {
  it('reports where the caret starts', () => {
    const lines = vi.fn()
    render(editor(lines, () => {}, null))
    expect(lines).toHaveBeenCalledWith(1)
  })

  it('reports a move within one knot, which leaves the knot unchanged', () => {
    const lines = vi.fn()
    const knots = vi.fn()

    const { rerender } = render(editor(lines, knots, null))
    lines.mockClear()
    knots.mockClear()

    rerender(editor(lines, knots, { line: 4, nonce: 1 }))

    expect(lines).toHaveBeenCalledWith(4)
    expect(knots).not.toHaveBeenCalled()
  })
})
