import { describe, expect, it } from 'vitest'
import { parseTag, formatTag } from './bundle/tagSpec'
import { parseNpcs } from './bundle/npcDoc'
import { emptyStats, newStat, newVariable, type StatsDocument } from './statsDoc'
import {
  conditionFor,
  inkEffectFor,
  findTrackable,
  tagFor,
  trackableForTag,
  trackablesOf
} from './trackables'

/**
 * The join between the two catalogues. What matters here is that a name means
 * the same thing on both sides of it: the variable this says `affection` lives
 * in has to be the one `renderStateInk` declared, and the tag it builds has to
 * be one `parseTag` reads back.
 */

const STATS: StatsDocument = {
  ...emptyStats(),
  stats: [
    { ...newStat('Courage'), min: 0, max: 10, display: 'Courage' },
    { ...newStat('Has met Wren', 'boolean') },
    { ...newStat('Title', 'text') }
  ],
  variables: [{ ...newVariable('Secret count'), min: 0, max: 3 }]
}

const NPCS = parseNpcs(
  JSON.stringify({
    version: 1,
    npcs: [
      {
        id: 'npc_x',
        inkId: 'abeline',
        name: 'Sister Abeline',
        stats: [{ key: 'affection', label: 'Affection', initial: 0, min: 0, max: 10 }],
        statuses: [
          { key: 'status', label: 'Status', initial: 'single', values: ['single', 'married'] }
        ],
        flags: [{ key: 'isPregnant', label: 'Pregnant', initial: false }]
      }
    ]
  })
)

const all = trackablesOf(STATS, NPCS)
const of = (variable: string): NonNullable<ReturnType<typeof findTrackable>> => {
  const found = findTrackable(all, variable)
  if (!found) throw new Error(`no trackable called ${variable}`)
  return found
}

describe('trackablesOf', () => {
  it('names a cast attribute by the variable the generated ink declares', () => {
    expect(all.map((one) => one.variable)).toEqual([
      'courage',
      'has_met_wren',
      'title',
      'secret_count',
      'abeline_affection',
      'abeline_status',
      'abeline_isPregnant'
    ])
  })

  it('groups the cast under the character rather than under Stats', () => {
    expect(of('courage').group).toBe('Stats')
    expect(of('secret_count').group).toBe('Vars')
    expect(of('abeline_affection').group).toBe('Sister Abeline')
  })

  it('carries the range a game will clamp to', () => {
    expect(of('abeline_affection')).toMatchObject({ min: 0, max: 10 })
    expect(of('courage')).toMatchObject({ min: 0, max: 10 })
  })

  it('carries the words a status may hold', () => {
    expect(of('abeline_status').values).toEqual(['single', 'married'])
  })

  /**
   * The channel rule, which is the whole reason this list exists rather than a
   * flat array of names: a tag is only worth writing where something at runtime
   * reads it. `# stat:` carries an integer, so a yes/no player stat has no tag
   * to be written as — while every cast attribute has a manager that owns it.
   */
  it('routes a change to whichever half can apply it', () => {
    expect(of('courage').channel).toBe('tag')
    expect(of('has_met_wren').channel).toBe('ink')
    expect(of('title').channel).toBe('ink')
    expect(of('abeline_affection').channel).toBe('tag')
    expect(of('abeline_status').channel).toBe('tag')
    expect(of('abeline_isPregnant').channel).toBe('tag')
  })

  it('has no tag to offer for the things nothing owns', () => {
    expect(of('has_met_wren').tag).toBeNull()
    expect(of('title').tag).toBeNull()
  })
})

describe('tagFor', () => {
  it('writes a tag that reads back as the change it was built from', () => {
    const built = [
      tagFor(of('courage'), '+', '1'),
      tagFor(of('courage'), '=', '5'),
      tagFor(of('abeline_affection'), '+', '2'),
      tagFor(of('abeline_status'), '=', 'married'),
      tagFor(of('abeline_isPregnant'), '=', 'true')
    ]

    for (const command of built) {
      expect(command).not.toBeNull()
      expect(parseTag(formatTag(command!))).toEqual(command)
    }

    expect(formatTag(built[2]!)).toBe('npc: abeline affection +2')
    expect(formatTag(built[3]!)).toBe('npc: abeline status = married')
  })

  it('refuses an amount that is not a number, rather than writing a dead tag', () => {
    expect(tagFor(of('courage'), '+', 'lots')).toBeNull()
  })

  it('has nothing to write for a stat no manager owns', () => {
    expect(tagFor(of('has_met_wren'), '=', 'true')).toBeNull()
  })
})

describe('trackableForTag', () => {
  it('finds the row a tag in a file names', () => {
    const command = parseTag('npc: abeline affection +2')!
    expect(trackableForTag(all, command)?.variable).toBe('abeline_affection')
  })

  it('finds nothing for someone who is not in the cast', () => {
    expect(trackableForTag(all, parseTag('npc: cordelia affection +2')!)).toBeNull()
    expect(trackableForTag(all, parseTag('stat: nerve +1')!)).toBeNull()
  })
})

describe('conditionFor and inkEffectFor', () => {
  it('quotes a status in a condition, because ink holds it as a string', () => {
    expect(conditionFor(of('abeline_status'), '==', 'married')).toBe('abeline_status == "married"')
  })

  it('reads a yes/no as the bare name', () => {
    expect(conditionFor(of('abeline_isPregnant'), '==', 'true')).toBe('abeline_isPregnant')
    expect(conditionFor(of('abeline_isPregnant'), '==', 'false')).toBe('not abeline_isPregnant')
  })

  it('compares a number however the author asked', () => {
    expect(conditionFor(of('abeline_affection'), '>=', '2')).toBe('abeline_affection >= 2')
    expect(conditionFor(of('courage'), '<', '3')).toBe('courage < 3')
  })

  it('writes ink logic for the things with no tag', () => {
    expect(inkEffectFor(of('has_met_wren'), 'set', 'true')).toBe('has_met_wren = true')
    expect(inkEffectFor(of('title'), 'set', 'archivist')).toBe('title = "archivist"')
  })
})
