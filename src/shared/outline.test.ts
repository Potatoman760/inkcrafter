import { describe, expect, it } from 'vitest'
import { flattenOutline, inkIdentifier, OUTLINE_TEMPLATE, parseOutline } from './outline'

const titles = (markdown: string): string[] =>
  flattenOutline(parseOutline(markdown)).map((node) => node.title)

describe('inkIdentifier', () => {
  it('turns a heading into a legal knot name', () => {
    expect(inkIdentifier('The Door')).toBe('the_door')
    expect(inkIdentifier('Act One: the arrival')).toBe('act_one_the_arrival')
  })

  it('will not start a knot with a digit, which ink forbids', () => {
    expect(inkIdentifier('3 Act Structure')).toBe('_3_act_structure')
  })

  it('strips accents rather than emitting them', () => {
    expect(inkIdentifier('Café')).toBe('cafe')
  })

  it('falls back rather than producing an empty name', () => {
    expect(inkIdentifier('!!!')).toBe('section')
    expect(inkIdentifier('')).toBe('section')
  })
})

describe('parseOutline', () => {
  it('reads nothing from an empty document', () => {
    const outline = parseOutline('')
    expect(outline.nodes).toEqual([])
    expect(outline.headingCount).toBe(0)
    expect(outline.preamble).toBe('')
  })

  it('keeps text before the first heading as the preamble', () => {
    const outline = parseOutline('Some notes.\n\n# Act One\n\nThe situation.')
    expect(outline.preamble).toBe('Some notes.')
    expect(outline.nodes).toHaveLength(1)
  })

  it('nests a smaller heading under the larger one above it', () => {
    const outline = parseOutline('# Act One\n\n## The door\n\n## Inside\n\n# Act Two')

    expect(outline.nodes.map((node) => node.title)).toEqual(['Act One', 'Act Two'])
    expect(outline.nodes[0]!.children.map((node) => node.title)).toEqual(['The door', 'Inside'])
    expect(outline.nodes[1]!.children).toEqual([])
  })

  it('takes the text under a heading as its summary', () => {
    const outline = parseOutline('# Act One\n\nThe situation, and what disturbs it.\n\n## The door')
    expect(outline.nodes[0]!.summary).toBe('The situation, and what disturbs it.')
    expect(outline.nodes[0]!.children[0]!.summary).toBe('')
  })

  it('nests a skipped level rather than discarding it', () => {
    // Authors jump from h1 to h3; losing the heading would be worse than
    // nesting it one deeper than they perhaps meant.
    const outline = parseOutline('# Act One\n\n### A beat')
    expect(outline.nodes[0]!.children.map((node) => node.title)).toEqual(['A beat'])
  })

  it('closes back out to a shallower level', () => {
    const outline = parseOutline('# One\n\n## A\n\n### B\n\n## C\n\n# Two')

    expect(outline.nodes.map((node) => node.title)).toEqual(['One', 'Two'])
    expect(outline.nodes[0]!.children.map((node) => node.title)).toEqual(['A', 'C'])
    expect(outline.nodes[0]!.children[0]!.children.map((node) => node.title)).toEqual(['B'])
  })

  it('ignores headings inside a fenced code block', () => {
    const markdown = ['# Real', '', '```', '# Not a heading', '```', '', '# Also real'].join('\n')
    expect(titles(markdown)).toEqual(['Real', 'Also real'])
  })

  it('keeps the fenced block in the summary it belongs to', () => {
    const outline = parseOutline('# Real\n\n```\n# Not a heading\n```')
    expect(outline.nodes[0]!.summary).toContain('# Not a heading')
  })

  it('records the line of each heading, for jumping to it', () => {
    const outline = parseOutline('Notes.\n\n# Act One\n\nText.\n\n## The door')
    expect(outline.nodes[0]!.line).toBe(3)
    expect(outline.nodes[0]!.children[0]!.line).toBe(7)
  })

  it('numbers nodes by position', () => {
    const outline = parseOutline('# One\n\n## A\n\n## B\n\n# Two')
    expect(outline.nodes[0]!.id).toBe('1')
    expect(outline.nodes[0]!.children.map((node) => node.id)).toEqual(['1.1', '1.2'])
    expect(outline.nodes[1]!.id).toBe('2')
  })

  it('gives every node the knot it would become', () => {
    const outline = parseOutline('# Act One\n\n## The Door')
    expect(outline.nodes[0]!.knot).toBe('act_one')
    expect(outline.nodes[0]!.children[0]!.knot).toBe('the_door')
  })

  it('counts the leaves, which are what would carry prose', () => {
    const outline = parseOutline('# One\n\n## A\n\n## B\n\n# Two')
    expect(outline.headingCount).toBe(4)
    expect(outline.leafCount).toBe(3)
  })

  it('reports knot names claimed twice, which would collide when generated', () => {
    const outline = parseOutline('# Act One\n\n## Escape\n\n# Act Two\n\n## Escape')
    expect(outline.duplicateKnots).toEqual(['escape'])
  })

  it('reports a collision between headings that only differ in punctuation', () => {
    const outline = parseOutline('# The Door\n\n# the door!')
    expect(outline.duplicateKnots).toEqual(['the_door'])
  })

  it('finds no collision when names are distinct', () => {
    expect(parseOutline('# One\n\n# Two').duplicateKnots).toEqual([])
  })

  it('handles a heading with no title', () => {
    const outline = parseOutline('#\n\nText.')
    expect(outline.headingCount).toBe(1)
    expect(outline.nodes[0]!.title).toBe('')
    expect(outline.nodes[0]!.knot).toBe('section')
  })

  it('reads CRLF the same as LF', () => {
    expect(titles('# One\r\n\r\n## A\r\n')).toEqual(['One', 'A'])
  })

  it('parses its own template into the shape it advertises', () => {
    const outline = parseOutline(OUTLINE_TEMPLATE)

    expect(outline.nodes.map((node) => node.title)).toEqual(['Act One', 'Act Two', 'Act Three'])
    expect(outline.preamble).toContain('Notes on the story')
    expect(outline.duplicateKnots).toEqual([])
    expect(outline.leafCount).toBe(4)
  })
})
