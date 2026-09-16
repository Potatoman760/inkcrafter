import { describe, expect, it } from 'vitest'
import { emptyGame, parseGame, serialiseGame } from './gameDoc'

describe('game document', () => {
  it('defaults old projects to no visible release version', () => {
    expect(parseGame('{}')).toEqual(emptyGame())
    expect(parseGame('{"version":1,"title":{}}').releaseVersion).toBe('')
  })

  it('round-trips and normalises the player-facing release version', () => {
    const game = { ...emptyGame(), releaseVersion: 'v2.4.1 beta' }
    expect(parseGame(serialiseGame(game))).toEqual(game)
    expect(parseGame(JSON.stringify({ releaseVersion: '  2026.09  ' })).releaseVersion).toBe('2026.09')
    expect(parseGame(JSON.stringify({ releaseVersion: 'x'.repeat(80) })).releaseVersion).toHaveLength(32)
  })
})
