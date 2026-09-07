// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { minigameModules } from '@shared/bundle/minigameDoc'
import { minigameEditors } from './registry'

describe('minigame editor discovery', () => {
  it('offers an editor and matching factory for every data module', () => {
    expect(minigameEditors.map((module) => module.kind).sort()).toEqual([...minigameModules.keys()].sort())
    for (const module of minigameEditors) {
      const game = module.create(1)
      expect(game.kind).toBe(module.kind)
      expect(minigameModules.get(game.kind)?.parse(game)).toEqual(game)
      expect(module.Fields).toBeTypeOf('function')
    }
  })
})
