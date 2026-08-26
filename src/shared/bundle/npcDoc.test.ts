import { describe, expect, it } from 'vitest'
import { emptyNpcs, parseNpcs, spriteForSpeaker } from './npcDoc'

/**
 * A speaker label is prose and a sprite name is an identifier, so joining them
 * is guesswork by nature. What matters is which way it fails: a label naming
 * nobody has to mean "nobody in particular", because that is what every line of
 * narration in every story looks like.
 */

const CAST = parseNpcs(
  JSON.stringify({
    version: 1,
    npcs: [
      { id: 'npc_a', inkId: 'abeline', name: 'Sister Abeline', sprite: 'abeline' },
      { id: 'npc_b', inkId: 'cordelia', name: 'Sister Cordelia', sprite: '' },
      { id: 'npc_c', inkId: 'kael', name: 'Kael', sprite: 'kael' }
    ]
  })
)

describe('spriteForSpeaker', () => {
  it('matches the name a speaker tag actually spells', () => {
    expect(spriteForSpeaker(CAST, 'Sister Abeline')).toBe('abeline')
  })

  it('matches the ink id, for a story whose cast list is bare', () => {
    expect(spriteForSpeaker(CAST, 'kael')).toBe('kael')
  })

  it('does not care about case or surrounding space', () => {
    expect(spriteForSpeaker(CAST, '  sister abeline ')).toBe('abeline')
  })

  // The line this has to get right: narration is most of a story.
  it('finds nobody for a label that is not a person', () => {
    expect(spriteForSpeaker(CAST, 'Narrator')).toBeNull()
    expect(spriteForSpeaker(CAST, '')).toBeNull()
    expect(spriteForSpeaker(emptyNpcs(), 'Sister Abeline')).toBeNull()
  })

  // Somebody tracked but never drawn is a voice off stage, not a sprite.
  it('finds nobody for a member of the cast with no sprite', () => {
    expect(spriteForSpeaker(CAST, 'Sister Cordelia')).toBeNull()
  })
})
