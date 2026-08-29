import { describe, expect, it } from 'vitest'
import { Story } from 'inkjs'
import { compileInk } from './compiler'

/**
 * The editor's compile has to count every visit.
 *
 * The preview stops at the end of the knot the cursor is in, and a visit count
 * is the only thing that can name the knot a line came from: ink's own pointers
 * — `currentPathString`, `previousPointer` — are both null on the last line
 * before a story runs out of content, which is exactly the line that leaked the
 * next scene's staging into this one.
 *
 * Locked down here rather than left as a comment, because turning the flag off
 * would not break a compile or fail a type check. It would quietly put the leak
 * back, and only in stories whose knots run straight on into one another.
 */
describe('the editor compile', () => {
  const SOURCE = `-> first

=== first ===
The first knot.
-> second

=== second ===
The second knot.
-> END
`

  it('counts visits, so the preview can tell which knot a line came from', () => {
    const { storyJson } = compileInk({ filePath: null, source: SOURCE })
    expect(storyJson).not.toBeNull()

    const story = new Story(storyJson as string)
    story.ChoosePathString('first')
    story.Continue()

    expect(story.state.VisitCountAtPathString('first')).toBeGreaterThan(0)
    expect(story.state.VisitCountAtPathString('second')).toBe(0)

    // The line that used to leak: ink cannot name its knot any other way.
    story.Continue()
    expect(story.state.VisitCountAtPathString('second')).toBeGreaterThan(0)
  })
})
