import { describe, expect, it } from 'vitest'
import { EDITABLE, type ProseNode } from '@shared/manuscript'
import { newTagLine, removeTag, replaces, rewriteTag, sectionTagBlock } from './sectionTags'

/**
 * Where a section's tags physically are.
 *
 * The case that decides the design is the first one: a knot's tags sit *above*
 * the first line the manuscript has an anchor for, so the obvious span — the
 * hull over the section's own nodes — does not contain them.
 */

const FILE = 'ink/main.ink'

let counter = 0

function node(line: number | null, text = 'A line.'): ProseNode {
  counter += 1
  return {
    kind: 'prose',
    id: `n${counter}`,
    text,
    tags: [],
    knot: null,
    source: line === null ? null : { file: FILE, line },
    edit: EDITABLE
  }
}

/** A file drawn as lines, so a case can be read rather than counted out. */
function source(...lines: string[]): (file: string) => string[] | null {
  return (asked) => (asked === FILE ? lines : null)
}

describe('sectionTagBlock', () => {
  it('finds the tags written above the first anchored line', () => {
    const lines = source(
      '=== seedblossom ===',
      '#bg: grove',
      '# show: seraphine at left',
      'You have arrived.',
      'The air is thick.'
    )

    const block = sectionTagBlock([node(4), node(5)], lines)

    expect(block.reason).toBeNull()
    expect(block.file).toBe(FILE)
    expect(block.tags.map((one) => one.raw)).toEqual(['bg: grove', 'show: seraphine at left'])
    expect(block.tags.map((one) => one.line)).toEqual([2, 3])
  })

  /** The knot header is what stops the walk, and so what keeps sections apart. */
  it('stops at the knot header rather than climbing into the section before', () => {
    const lines = source(
      'The end of the last scene.',
      '# bg: harbour',
      '',
      '=== seedblossom ===',
      '# bg: grove',
      'You have arrived.'
    )

    const block = sectionTagBlock([node(6)], lines)

    expect(block.tags.map((one) => one.raw)).toEqual(['bg: grove'])
  })

  it('stops at a line of prose', () => {
    const lines = source('An earlier beat.', '# bg: grove', 'You have arrived.')
    const block = sectionTagBlock([node(3)], lines)

    expect(block.tags.map((one) => one.raw)).toEqual(['bg: grove'])
  })

  it('walks over blank lines and comments to reach the block', () => {
    const lines = source(
      '=== seedblossom ===',
      '# bg: grove',
      '// staged last week',
      '',
      'You have arrived.'
    )

    const block = sectionTagBlock([node(5)], lines)

    expect(block.tags.map((one) => one.raw)).toEqual(['bg: grove'])
  })

  it('finds a tag inside the section as well as above it', () => {
    const lines = source('# bg: grove', 'You have arrived.', 'She turns. # bg: night', 'Silence.')
    const block = sectionTagBlock([node(2), node(3), node(4)], lines)

    expect(block.tags.map((one) => one.raw)).toEqual(['bg: grove', 'bg: night'])
  })

  it('reports where a tag sits in its line, so it can be rewritten in place', () => {
    const lines = source('She turns. # bg: night')
    const block = sectionTagBlock([node(1)], lines)
    const tag = block.tags[0]!

    expect('She turns. # bg: night'.slice(tag.from, tag.to)).toBe('# bg: night')
  })

  it('is not fooled by a block comment opened above the section', () => {
    const lines = source('/*', '# bg: nowhere', '*/', '# bg: grove', 'You have arrived.')
    const block = sectionTagBlock([node(5)], lines)

    expect(block.tags.map((one) => one.raw)).toEqual(['bg: grove'])
  })

  describe('where a new tag goes', () => {
    it('joins the end of the block above the section', () => {
      const lines = source('=== seedblossom ===', '#bg: grove', 'You have arrived.')
      expect(sectionTagBlock([node(3)], lines).insertAt).toBe(3)
    })

    it('becomes the first line of the section when there is no block yet', () => {
      const lines = source('=== seedblossom ===', 'You have arrived.', 'The air is thick.')
      expect(sectionTagBlock([node(2), node(3)], lines).insertAt).toBe(2)
    })

    /**
     * The trap. Ink hands a chunk its tags on the way in, so a paragraph
     * preceded by tags is often anchored to the first *tag* line rather than to
     * the prose — which puts the block inside the span instead of above it. A
     * rule that took "the tags above the first anchored line" found none here
     * and wrote the new one on top of the existing ones.
     */
    it('goes below the block even when the section is anchored to it', () => {
      const lines = source('=== knot ===', '# show: wren at left', 'She waits.')
      expect(sectionTagBlock([node(2), node(3)], lines).insertAt).toBe(3)
    })

    it('goes below a block that has a blank line under it', () => {
      const lines = source('# bg: grove', '', 'You have arrived.')
      expect(sectionTagBlock([node(3)], lines).insertAt).toBe(2)
    })

    /**
     * A tag mid-section says something about that moment. A new one belongs at
     * the top of the section, not below the last thing the author staged
     * halfway down it.
     */
    it('ignores a tag written mid-section when choosing where', () => {
      const lines = source('# bg: grove', 'You have arrived.', 'She turns. # bg: night', 'Silence.')
      expect(sectionTagBlock([node(2), node(3), node(4)], lines).insertAt).toBe(2)
    })
  })

  describe('when there is nowhere to write', () => {
    it('refuses a section with no anchored line', () => {
      const block = sectionTagBlock([node(null), node(null)], source('anything'))

      expect(block.insertAt).toBeNull()
      expect(block.reason).toMatch(/no line in the source/)
    })

    it('refuses a section spread across two files', () => {
      const here = node(1)
      const there: ProseNode = { ...node(2), source: { file: 'ink/two.ink', line: 2 } }

      expect(sectionTagBlock([here, there], source('a', 'b')).reason).toMatch(/more than one file/)
    })

    it('refuses when the file cannot be read', () => {
      expect(sectionTagBlock([node(1)], () => null).reason).toMatch(/could not be read/)
    })
  })
})

describe('replaces', () => {
  const found = (...raws: string[]) => sectionTagBlock([node(raws.length + 1)], source(...raws, 'Prose.')).tags

  it('replaces the background, because there is only one', () => {
    expect(replaces(found('# bg: grove'), { kind: 'bg', name: 'harbour', variant: null })).toBe(0)
  })

  it('replaces music, speaker, active and the map toggle the same way', () => {
    expect(replaces(found('# music: theme'), { kind: 'music', name: 'other', variant: null })).toBe(0)
    expect(replaces(found('# speaker: Wren'), { kind: 'speaker', name: 'Kael' })).toBe(0)
    expect(replaces(found('# active: wren'), { kind: 'active', active: { rule: 'nobody' } })).toBe(0)
    expect(replaces(found('# map: on'), { kind: 'map', enabled: false })).toBe(0)
  })

  /** The reason this is subject-matching and not kind-matching. */
  it('changes the character named and leaves the others standing', () => {
    const tags = found('# show: wren at left', '# show: kael at right')

    expect(replaces(tags, { kind: 'show', name: 'kael', variant: 'happy', slot: null, flipped: false })).toBe(1)
    expect(replaces(tags, { kind: 'show', name: 'nobody_yet', variant: null, slot: null, flipped: false })).toBe(-1)
  })

  it('treats showing and hiding one character as the same subject', () => {
    const tags = found('# hide: wren')
    expect(replaces(tags, { kind: 'show', name: 'wren', variant: null, slot: 'left', flipped: false })).toBe(0)
  })

  it('matches a stat by name and a cast attribute by both parts', () => {
    const tags = found('# stat: courage +1', '# npc: abeline affection +2')

    expect(replaces(tags, { kind: 'stat', stat: 'courage', op: '=', value: 5 })).toBe(0)
    expect(replaces(tags, { kind: 'stat', stat: 'faith', op: '+', value: 1 })).toBe(-1)
    expect(replaces(tags, { kind: 'npc', id: 'abeline', attr: 'affection', op: '=', value: '9' })).toBe(1)
    expect(replaces(tags, { kind: 'npc', id: 'abeline', attr: 'status', op: '=', value: 'wed' })).toBe(-1)
  })

  it('never replaces anything with a clear, or a clear with anything', () => {
    expect(replaces(found('# show: wren'), { kind: 'clear' })).toBe(-1)
    expect(replaces(found('# clear'), { kind: 'show', name: 'wren', variant: null, slot: null, flipped: false })).toBe(-1)
  })
})

describe('rewriting one tag', () => {
  const tagIn = (line: string) => sectionTagBlock([node(1)], source(line))!.tags[0]!

  it('leaves the rest of the line exactly as it was', () => {
    const line = 'She turns. # bg: night'
    expect(rewriteTag(line, tagIn(line), { kind: 'bg', name: 'dawn', variant: null })).toBe(
      'She turns. # bg: dawn'
    )
  })

  it('keeps the spacing the author chose after the hash', () => {
    expect(rewriteTag('#bg: night', tagIn('#bg: night'), { kind: 'bg', name: 'dawn', variant: null })).toBe(
      '#bg: dawn'
    )
  })

  it('leaves a second tag on the same line alone', () => {
    const line = '# bg: night # show: wren'
    const first = sectionTagBlock([node(1)], source(line)).tags[0]!

    expect(rewriteTag(line, first, { kind: 'bg', name: 'dawn', variant: null })).toBe(
      '# bg: dawn # show: wren'
    )
  })
})

describe('removing one tag', () => {
  const tagsIn = (line: string) => sectionTagBlock([node(1)], source(line)).tags

  it('takes the whole line when the tag was all of it', () => {
    expect(removeTag('# bg: night', tagsIn('# bg: night')[0]!)).toBeNull()
    expect(removeTag('   #bg: night  ', tagsIn('   #bg: night  ')[0]!)).toBeNull()
  })

  it('keeps a line that had prose on it', () => {
    expect(removeTag('She turns. # bg: night', tagsIn('She turns. # bg: night')[0]!)).toBe('She turns.')
  })

  it('keeps a line that had another tag on it, and closes the gap', () => {
    const line = '# bg: night # show: wren'
    expect(removeTag(line, tagsIn(line)[0]!)).toBe('# show: wren')
    expect(removeTag('    ' + line, tagsIn('    ' + line)[0]!)).toBe('    # show: wren')
  })

  it('closes the gap after prose too', () => {
    const line = 'She turns. # bg: night # show: wren'
    expect(removeTag(line, tagsIn(line)[0]!)).toBe('She turns. # show: wren')
  })
})

describe('newTagLine', () => {
  it('matches the indentation of the line it is joining', () => {
    const lines = ['=== knot ===', '    # bg: grove', '    You have arrived.']
    expect(newTagLine(lines, 3, { kind: 'music', name: 'theme', variant: null })).toBe('    # music: theme')
  })

  it('falls back to the line above at the end of the file', () => {
    expect(newTagLine(['  Prose.'], 2, { kind: 'clear' })).toBe('  # clear')
  })
})

/**
 * The block reaches past the first anchored line.
 *
 * Ink hands a chunk its tags on the way in, so a paragraph preceded by staging
 * is anchored to the *first* of those tag lines. Bounding the block there found
 * one tag of a knot and none of the rest — and changing the second character
 * appended a line contradicting the one already above it.
 */
describe('a knot staged with several tags', () => {
  const knot = source(
    '=== arrival ===',
    '# bg: grove',
    '# show: wren at left',
    '# show: kael at right',
    'The portal opens.'
  )

  /** Anchored to line 2, the first tag, which is what ink actually reports. */
  const anchored = [node(2)]

  it('finds every tag staging it, not only the first', () => {
    expect(sectionTagBlock(anchored, knot).tags.map((one) => one.raw)).toEqual([
      'bg: grove',
      'show: wren at left',
      'show: kael at right'
    ])
  })

  it('can therefore find the second character to change', () => {
    const tags = sectionTagBlock(anchored, knot).tags

    expect(replaces(tags, { kind: 'show', name: 'kael', variant: 'wary', slot: null, flipped: false })).toBe(2)
  })

  it('still puts a new tag at the end of the run', () => {
    expect(sectionTagBlock(anchored, knot).insertAt).toBe(5)
  })

  it('does not reach into the knot below', () => {
    const two = source(
      '=== arrival ===',
      '# bg: grove',
      'The portal opens.',
      '',
      '=== harbourside ===',
      '# bg: harbour',
      'The water.'
    )

    expect(sectionTagBlock([node(2)], two).tags.map((one) => one.raw)).toEqual(['bg: grove'])
  })

  it('crosses a blank line inside the run', () => {
    const spaced = source('=== arrival ===', '# bg: grove', '', '# show: wren', 'The portal opens.')

    expect(sectionTagBlock([node(2)], spaced).tags.map((one) => one.raw)).toEqual([
      'bg: grove',
      'show: wren'
    ])
  })
})
