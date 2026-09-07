import { newId } from '../../../ids'
import { minigameName, tuned, record, text, mediaRef, parseTunable } from '../common'
import type { GalleryMediaRef } from '../../galleryDoc'
import type { TunableNumber } from '../common'

/** The six pictures the first combat runtime knows how to ask for. */
export const COMBATANT_STATES = [
  'idle',
  'left_prep',
  'left_strike',
  'right_prep',
  'right_strike',
  'vulnerable'
] as const

export type CombatantState = (typeof COMBATANT_STATES)[number]
export interface CombatMinigame {
  /** `mng_…`. Stable across display/name changes. */
  id: string
  kind: 'combat'
  /** Ink-safe name used by `# minigame:`. */
  name: string
  display: string
  description: string
  /** Optional concrete background look rendered behind the opponent. */
  background: GalleryMediaRef | null
  /** Stable id of a `combatant` media asset. */
  opponentAssetId: string
  /** Existing numeric stat/hidden variable damaged by a missed parry. */
  playerHealthVariable: string
  /** Existing text variable set to `victory` or `defeat`. */
  resultVariable: string
  /** Tutorial-only transient instructions and action feedback. */
  showStateHints: boolean
  opponentHealth: TunableNumber
  incomingDamage: TunableNumber
  counterDamage: TunableNumber
  /** How long the matching side may be clicked after prep appears. */
  prepWindowMs: TunableNumber
  /** How long Space/click remains available after a parry. */
  counterWindowMs: TunableNumber
  /** Chance that an attempted counter deals damage, clamped to 0–100. */
  counterChancePercent: TunableNumber
  /** Pause on idle art between exchanges. */
  idleMs: TunableNumber
  /** How long the strike art remains visible after a miss. */
  strikeMs: TunableNumber
}

export function newCombatMinigame(name: string): CombatMinigame {
  return {
    id: newId('mng'),
    kind: 'combat',
    name: minigameName(name),
    display: name.trim(),
    description: '',
    background: null,
    opponentAssetId: '',
    playerHealthVariable: '',
    resultVariable: '',
    showStateHints: false,
    opponentHealth: tuned(30),
    incomingDamage: tuned(10),
    counterDamage: tuned(10),
    prepWindowMs: tuned(700),
    counterWindowMs: tuned(650),
    counterChancePercent: tuned(100),
    idleMs: tuned(500),
    strikeMs: tuned(350)
  }
}

export function parseCombat(value: unknown): CombatMinigame | null {
  const one = record(value)
  if (!one || one['kind'] !== 'combat') return null
  const name = minigameName(text(one['name']))
  if (name.length === 0) return null
  return {
    id: text(one['id']) || newId('mng'),
    kind: 'combat',
    name,
    display: text(one['display']) || name,
    description: text(one['description']),
    background: mediaRef(one['background']),
    opponentAssetId: text(one['opponentAssetId']),
    playerHealthVariable: text(one['playerHealthVariable']),
    resultVariable: text(one['resultVariable']),
    // `showCounterHint` briefly shipped with narrower semantics; accepting it
    // preserves an encounter that enabled the tutorial prompt before the name
    // was corrected.
    showStateHints: one['showStateHints'] === true || one['showCounterHint'] === true,
    opponentHealth: parseTunable(one['opponentHealth'], 30),
    incomingDamage: parseTunable(one['incomingDamage'], 10),
    counterDamage: parseTunable(one['counterDamage'], 10),
    prepWindowMs: parseTunable(one['prepWindowMs'], 700),
    counterWindowMs: parseTunable(one['counterWindowMs'], 650),
    counterChancePercent: parseTunable(one['counterChancePercent'], 100),
    idleMs: parseTunable(one['idleMs'], 500),
    strikeMs: parseTunable(one['strikeMs'], 350)
  }
}

export default { kind: 'combat', create: newCombatMinigame, parse: parseCombat } as const
