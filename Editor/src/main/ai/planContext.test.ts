import { describe, expect, it } from 'vitest'
import { planContextForKnot, planMatrix, planActs, charactersOf } from '@shared/plan'
import { planFromMarkdown } from '@shared/planDoc'
import { newEntry, type CodexEntry } from '@shared/codex'
import { renderPlanContext } from './planContext'

/** Built through the markdown importer, which is how a plan usually arrives. */
const PLAN = planFromMarkdown(
  [
    '# Act One',
    '',
    'The situation, and what disturbs it.',
    '',
    '## The door',
    'status: drafting',
    'tags: night, arrival',
    '',
    'She arrives at the archive after hours. Wren does not answer.',
    '',
    '## Inside',
    '',
    'What she finds on the shelves.',
    '',
    '# Act Two',
    '',
    'The complication.',
    '',
    '## The ledger',
    '',
    'The page she was not meant to see.',
    ''
  ].join('\n')
)

function entry(name: string, overrides: Partial<CodexEntry> = {}): CodexEntry {
  return {
    ...newEntry('lib_0000000000', name, 'character', name.toLowerCase()),
    id: `cdx_${name.toLowerCase().replace(/\W/g, '')}`,
    ...overrides
  }
}

const wren = entry('Wren')
const archive = entry('The Archive', { type: 'location' })
const codex = [wren, archive]

describe('planContextForKnot', () => {
  it('finds a node by the knot its heading produces', () => {
    const context = planContextForKnot(PLAN, 'the_door')
    expect(context?.node.title).toBe('The door')
  })

  it('gives the ancestry, outermost first', () => {
    const context = planContextForKnot(PLAN, 'the_door')
    expect(context?.ancestry.map((node) => node.title)).toEqual(['Act One', 'The door'])
  })

  it('gives the next sibling, which is the direction', () => {
    expect(planContextForKnot(PLAN, 'the_door')?.next?.title).toBe('Inside')
  })

  it('has no next sibling at the end of an act', () => {
    expect(planContextForKnot(PLAN, 'inside')?.next).toBeNull()
  })

  it('matches an act as readily as a chapter', () => {
    const context = planContextForKnot(PLAN, 'act_two')
    expect(context?.role).toBe('act')
    expect(context?.next).toBeNull()
  })

  it('returns nothing for a knot the plan does not claim', () => {
    expect(planContextForKnot(PLAN, 'somewhere_else')).toBeNull()
    expect(planContextForKnot(PLAN, null)).toBeNull()
  })
})

describe('renderPlanContext', () => {
  it('says where the section sits', () => {
    const text = renderPlanContext(PLAN, 'the_door')
    expect(text).toContain('PLAN')
    expect(text).toContain('Act One › The door (chapter)')
  })

  it('gives the chapter summary and the act it serves', () => {
    const text = renderPlanContext(PLAN, 'the_door')
    expect(text).toContain('She arrives at the archive after hours')
    expect(text).toContain('The situation, and what disturbs it.')
  })

  it('names what follows, and says to lead towards it rather than arrive', () => {
    const text = renderPlanContext(PLAN, 'the_door')
    expect(text).toContain('What follows: Inside')
    expect(text).toContain('without arriving')
  })

  it('carries the tags', () => {
    expect(renderPlanContext(PLAN, 'the_door')).toContain('Tags: night, arrival')
  })

  it('stops at the next sibling rather than describing the whole story', () => {
    // Act Two is not this section's business, and telling the model about it
    // hands over the ending while asking it not to resolve anything.
    const text = renderPlanContext(PLAN, 'the_door')
    expect(text).not.toContain('The ledger')
    expect(text).not.toContain('The complication')
  })

  it('renders nothing when the knot matches nothing', () => {
    expect(renderPlanContext(PLAN, 'unknown_knot')).toBe('')
    expect(renderPlanContext(PLAN, null)).toBe('')
  })

  it('truncates a summary long enough to displace the story', () => {
    const long = planFromMarkdown(`# One\n\n## Two\n\n${'word '.repeat(400)}`)
    const text = renderPlanContext(long, 'two')
    expect(text).toContain('…')
    expect(text.length).toBeLessThan(1_500)
  })
})

describe('plan derivation', () => {
  it('rolls a chapter’s characters up from its summary', () => {
    const door = PLAN.nodes[0]!.children[0]!
    expect(charactersOf(door, codex).map((c) => c.name)).toEqual(['Wren'])
  })

  it('rolls an act’s characters up from its chapters', () => {
    // Act One names nobody itself; its cast comes from what is beneath it.
    const act = PLAN.nodes[0]!
    expect(act.summary).not.toContain('Wren')
    expect(charactersOf(act, codex).map((c) => c.name)).toContain('Wren')
  })

  it('groups chapters under their act for the grid', () => {
    const acts = planActs(PLAN, codex)
    expect(acts.map((act) => act.node.title)).toEqual(['Act One', 'Act Two'])
    expect(acts[0]!.chapters.map((chapter) => chapter.node.title)).toEqual(['The door', 'Inside'])
  })

  it('builds a matrix that agrees with the grid', () => {
    const matrix = planMatrix(PLAN, codex)
    const acts = planActs(PLAN, codex)

    expect(matrix.chapters.map((chapter) => chapter.title)).toEqual([
      'The door',
      'Inside',
      'The ledger'
    ])

    for (const act of acts) {
      for (const chapter of act.chapters) {
        for (const character of chapter.characters) {
          expect(matrix.appearances.has(`${character.id}:${chapter.node.id}`)).toBe(true)
        }
      }
    }
  })

  it('marks only the chapters a character is actually in', () => {
    const matrix = planMatrix(PLAN, codex)
    const door = PLAN.nodes[0]!.children[0]!
    const ledger = PLAN.nodes[1]!.children[0]!

    expect(matrix.appearances.has(`${wren.id}:${door.id}`)).toBe(true)
    expect(matrix.appearances.has(`${wren.id}:${ledger.id}`)).toBe(false)
  })

  it('treats a childless act as its own chapter, so it still appears', () => {
    const flat = planFromMarkdown('# Alone\n\nWren waits.\n')
    const matrix = planMatrix(flat, codex)
    expect(matrix.chapters.map((chapter) => chapter.title)).toEqual(['Alone'])
    expect(matrix.characters.map((character) => character.name)).toEqual(['Wren'])
  })
})
