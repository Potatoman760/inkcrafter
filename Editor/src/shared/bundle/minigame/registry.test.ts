import { describe, expect, it } from 'vitest'
import { minigameModules, parseMinigames, serialiseMinigames } from '../minigameDoc'

describe('file-based minigame data modules', () => {
  const files = import.meta.glob<{ default: { kind: string } }>('./*/data.ts', { eager: true })

  it('registers every data file, using the folder as its stable kind', () => {
    const kinds = Object.entries(files).map(([path, module]) => {
      expect(path).toBe(`./${module.default.kind}/data.ts`)
      return module.default.kind
    }).sort()
    expect([...minigameModules.keys()].sort()).toEqual(kinds)
  })

  it('round-trips a mixed catalogue through the discovered parsers', () => {
    const games = [...minigameModules.values()].map((module) => module.create(`Test ${module.kind}`))
    const doc = { version: 1 as const, minigames: games }
    expect(parseMinigames(serialiseMinigames(doc))).toEqual(doc)
  })

  it('skips unknown and invalid rows without losing adjacent modules', () => {
    const games = [...minigameModules.values()].map((module) => module.create(module.kind))
    const json = JSON.stringify({ minigames: [null, { kind: 'unknown', name: 'unknown' }, ...games, {}] })
    expect(parseMinigames(json).minigames).toEqual(games)
  })
})
