import { describe, expect, it } from 'vitest'
import { parseEstateTutorial, newEstateState, readEstateState, type EstateTutorial } from './estate'
import { newEstateMinigame, parseMinigames, serialiseMinigames } from './minigameDoc'

const tour: EstateTutorial = { version: 1, autoStart: true, speaker: { name: 'Isolde', sprite: 'isolde', expression: 'neutral' },
  steps: [{ title: 'Welcome', text: 'Let us begin.', testText: 'A test.', page: 'villa', target: 'room', room: 'east' }] }

describe('estate tutorial JSON', () => {
  it('round-trips through the actual minigame catalogue', () => {
    const game = { ...newEstateMinigame('Villa'), tutorial: tour }
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [game] })).minigames).toEqual([game])
    expect(parseEstateTutorial(tour)).toEqual(tour)
    expect(parseEstateTutorial(null)).toBeNull()
  })
  it.each([
    { ...tour, version: 0 }, { ...tour, autoStart: 'true' }, { ...tour, steps: [] },
    { ...tour, speaker: { name: 'Isolde' } }, { ...tour, typo: true },
    ...[{ target: 'typo' }, { page: 'typo' }, { target: 'restore' }, { room: undefined },
      { text: 'x'.repeat(361) }, { title: '' }, { testText: false }, { surprise: 'field' }]
      .map(change => ({ ...tour, steps: [{ ...tour.steps[0], ...change }] }))
  ])('rejects malformed script fields instead of saving a partial tour', value => {
    expect(() => parseEstateTutorial(value)).toThrow()
  })
  it('does not discard other games if an external file contains an invalid tour', () => {
    const games = [{ ...newEstateMinigame('Villa'), tutorial: { steps: [] } }, newEstateMinigame('Second')]
    const parsed = parseMinigames(JSON.stringify({ minigames: games }))
    expect(parsed.minigames).toHaveLength(2)
    expect(parsed.minigames[0]).toMatchObject({ tutorial: null })
  })
  it('keeps completion in the ledger without changing old save requirements', () => {
    const old = newEstateState(80)
    expect(readEstateState(JSON.stringify(old), 80)).toEqual(old)
    const completed = { ...old, tutorialSeen: 2 }
    expect(readEstateState(JSON.stringify(completed), 80)).toEqual(completed)
  })
})
