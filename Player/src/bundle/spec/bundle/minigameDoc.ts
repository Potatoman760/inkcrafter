// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

import { record } from './minigame/common'
import { minigameModules, type MinigameDefinition } from './minigame/registry.generated'
export * from './minigame/common'
export * from './minigame/registry.generated'

export interface MinigameDocument {
  version: 1
  minigames: MinigameDefinition[]
}

export function emptyMinigames(): MinigameDocument {
  return { version: 1, minigames: [] }
}

/** Tolerant like every other authored catalogue: one broken row does not hide the rest. */
export function parseMinigames(json: string): MinigameDocument {
  try {
    const top = record(JSON.parse(json))
    if (!top) return emptyMinigames()
    return {
      version: 1,
      minigames: Array.isArray(top['minigames'])
        ? top['minigames'].flatMap((value) => {
            const kind = record(value)?.['kind']
            const game = typeof kind === 'string' ? minigameModules.get(kind)?.parse(value) : null
            return game ? [game] : []
          })
        : []
    }
  } catch {
    return emptyMinigames()
  }
}

export function serialiseMinigames(doc: MinigameDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
