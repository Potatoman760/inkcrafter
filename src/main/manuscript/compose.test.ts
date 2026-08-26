import { describe, expect, it } from 'vitest'
import { EDITABLE, type ProseNode } from '@shared/manuscript'
import { canReplaceSection, pureProseOf } from './compose'

/**
 * Whether a section may be overwritten wholesale.
 *
 * Replacing splices a whole span away, so the question is never "is this
 * roughly prose" but "is there anything in here the draft does not know about".
 * A tag is exactly that, and it used to slip through: `pureProseOf` cuts a line
 * at its `#` before judging it, so a staged line read as ordinary prose and was
 * then thrown away with its staging.
 */

const FILE = 'ink/main.ink'

let counter = 0

function node(line: number, text = 'A line.'): ProseNode {
  counter += 1
  return {
    kind: 'prose',
    id: `n${counter}`,
    text,
    tags: [],
    knot: null,
    source: { file: FILE, line },
    edit: EDITABLE
  }
}

function source(...lines: string[]): (file: string) => string[] | null {
  return (asked) => (asked === FILE ? lines : null)
}

describe('canReplaceSection', () => {
  it('allows a span that is nothing but prose', () => {
    const check = canReplaceSection([node(1), node(2)], source('She turns.', 'He waits.'))

    expect(check.safe).toBe(true)
    expect(check.from).toBe(1)
    expect(check.to).toBe(2)
  })

  it('refuses a span holding a tag on a line of its own', () => {
    const check = canReplaceSection(
      [node(1), node(3)],
      source('She turns.', '# bg: harbour', 'He waits.')
    )

    expect(check.safe).toBe(false)
    expect(check.reason).toMatch(/Line 2 carries # bg: harbour/)
  })

  /** The one that was silent: a tag riding along at the end of a sentence. */
  it('refuses a span holding a tag after prose on the same line', () => {
    const check = canReplaceSection([node(1)], source('She turns. # bg: harbour'))

    expect(check.safe).toBe(false)
    expect(check.reason).toMatch(/would discard/)
  })

  it('says which line and what was on it, so the refusal can be acted on', () => {
    const check = canReplaceSection(
      [node(1), node(2)],
      source('She turns.', 'He waits. # show: wren at left')
    )

    expect(check.reason).toContain('Line 2')
    expect(check.reason).toContain('show: wren at left')
  })

  /**
   * The ordinary shape must still replace. A knot's staging sits above the
   * section's first line, outside the span, and is never touched by the splice.
   */
  it('allows a section staged above its own first line', () => {
    const check = canReplaceSection([node(3), node(4)], source(
      '=== start ===',
      '# bg: harbour',
      'She turns.',
      'He waits.'
    ))

    expect(check.safe).toBe(true)
    expect(check.from).toBe(3)
  })

  it('is not fooled by a hash inside interpolation', () => {
    const check = canReplaceSection([node(1)], source('A room. // # bg: harbour'))

    expect(check.safe).toBe(true)
  })

  it('still refuses the things it always refused', () => {
    expect(canReplaceSection([node(1), node(3)], source('She turns.', '~ courage++', 'He waits.')).reason)
      .toMatch(/not plain prose/)
    expect(canReplaceSection([], source('anything')).reason).toMatch(/no lines in the source/)
  })
})

describe('pureProseOf', () => {
  it('reads a plain line as itself', () => {
    expect(pureProseOf('  She turns.  ')).toBe('She turns.')
  })

  it('is not what guards a tag — it cuts the line at the hash', () => {
    // Kept as a test because it is the behaviour that made the tag check
    // necessary rather than a bug to fix here: what this answers is "is the
    // prose on this line replaceable", not "is this line safe to delete".
    expect(pureProseOf('She turns. # bg: harbour')).toBe('She turns.')
  })

  it('refuses structure', () => {
    expect(pureProseOf('* A choice')).toBeNull()
    expect(pureProseOf('~ courage++')).toBeNull()
    expect(pureProseOf('-> elsewhere')).toBeNull()
    expect(pureProseOf('She counted {one} thing.')).toBeNull()
    expect(pureProseOf('   ')).toBeNull()
  })
})
