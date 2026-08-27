import { describe, expect, it } from 'vitest'
import {
  newCombatMinigame,
  newQuickhandsMinigame,
  parseMinigames,
  resolveTunable,
  serialiseMinigames
} from './minigameDoc'

describe('minigame catalogue', () => {
  it('round-trips combat definitions without losing stat modifiers', () => {
    const combat = newCombatMinigame('Alley guard')
    combat.playerHealthVariable = 'health'
    combat.resultVariable = 'combat_result'
    combat.background = { assetId: 'med_background', variantId: 'med_night' }
    combat.showStateHints = true
    combat.prepWindowMs.modifiers.push({ stat: 'reflexes', perPoint: 25 })

    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [combat] }))).toEqual({
      version: 1,
      minigames: [combat]
    })
  })

  it('round-trips quick-hands graphics and tuning', () => {
    const quickhands = newQuickhandsMinigame('Broodmarket cabinet')
    quickhands.resultVariable = 'quickhands_result'
    quickhands.background = { assetId: 'med_market', variantId: 'med_day' }
    quickhands.targetArt = { assetId: 'med_token', variantId: 'med_gold' }
    quickhands.hazardArt = { assetId: 'med_token', variantId: 'med_thorn' }
    quickhands.catcherArt = { assetId: 'med_hand', variantId: 'med_open' }
    quickhands.spawnIntervalMs.modifiers.push({ stat: 'dexterity', perPoint: -20 })

    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [quickhands] }))).toEqual({
      version: 1,
      minigames: [quickhands]
    })
  })

  it('resolves base plus every stat contribution, then rounds and clamps', () => {
    const values = new Map([['reflexes', 4], ['difficulty', 2]])
    expect(resolveTunable(
      {
        base: 600,
        modifiers: [
          { stat: 'reflexes', perPoint: 25 },
          { stat: 'difficulty', perPoint: -100 }
        ]
      },
      (name) => values.get(name) ?? 0,
      150,
      10_000
    )).toBe(500)
    expect(resolveTunable({ base: 140, modifiers: [] }, () => 0, 150)).toBe(150)
  })

  it('drops malformed rows and tolerates an unreadable document', () => {
    expect(parseMinigames('not json').minigames).toEqual([])
    expect(parseMinigames(JSON.stringify({
      minigames: [
        null,
        { kind: 'puzzle', name: 'x' },
        { kind: 'combat', name: '' },
        { kind: 'quickhands', name: '' }
      ]
    })).minigames).toEqual([])
  })
})
