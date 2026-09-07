import { newId } from '../../../ids'
import { minigameName, tuned, record, text, mediaRef, parseTunable, mediaRefList } from '../common'
import type { GalleryMediaRef } from '../../galleryDoc'
import type { TunableNumber } from '../common'

export interface PowerStrikeMinigame {
  /** `mng_…`. Stable across display/name changes. */
  id: string
  kind: 'powerstrike'
  /** Ink-safe name used by `# minigame:`. */
  name: string
  display: string
  description: string
  /** Optional concrete background look behind the target. */
  background: GalleryMediaRef | null
  /** Ordered intact-to-broken target looks; absent draws a built-in log. */
  targetArt: GalleryMediaRef[]
  /** Optional still tool look; absent draws a built-in splitting maul. */
  toolArt: GalleryMediaRef | null
  /** Existing text variable set to `victory` or `defeat`. */
  resultVariable: string
  /** Transient instructions and strike feedback. */
  showStateHints: boolean
  targetDurability: TunableNumber
  strikeLimit: TunableNumber
  /** Time for the power meter to travel from empty to overextended. */
  chargeDurationMs: TunableNumber
  /** Centre of the best release band, from 0–100. */
  idealPowerPercent: TunableNumber
  /** Total width of the inner, perfect band. */
  perfectWindowPercent: TunableNumber
  /** Total width of the outer, solid-hit band. */
  goodWindowPercent: TunableNumber
  perfectDamage: TunableNumber
  goodDamage: TunableNumber
  weakDamage: TunableNumber
  /** Damage retained when the player attacks the unmarked side. */
  wrongSideDamagePercent: TunableNumber
  /** Pause after a blow before the next weak point appears. */
  recoveryMs: TunableNumber
}

export function newPowerStrikeMinigame(name: string): PowerStrikeMinigame {
  return {
    id: newId('mng'),
    kind: 'powerstrike',
    name: minigameName(name),
    display: name.trim(),
    description: '',
    background: null,
    targetArt: [],
    toolArt: null,
    resultVariable: '',
    showStateHints: true,
    targetDurability: tuned(100),
    strikeLimit: tuned(7),
    chargeDurationMs: tuned(1_500),
    idealPowerPercent: tuned(78),
    perfectWindowPercent: tuned(10),
    goodWindowPercent: tuned(30),
    perfectDamage: tuned(34),
    goodDamage: tuned(20),
    weakDamage: tuned(6),
    wrongSideDamagePercent: tuned(25),
    recoveryMs: tuned(650)
  }
}

export function parsePowerStrike(value: unknown): PowerStrikeMinigame | null {
  const one = record(value)
  if (!one || one['kind'] !== 'powerstrike') return null
  const name = minigameName(text(one['name']))
  if (name.length === 0) return null
  return {
    id: text(one['id']) || newId('mng'),
    kind: 'powerstrike',
    name,
    display: text(one['display']) || name,
    description: text(one['description']),
    background: mediaRef(one['background']),
    targetArt: mediaRefList(one['targetArt']),
    toolArt: mediaRef(one['toolArt']),
    resultVariable: text(one['resultVariable']),
    showStateHints: one['showStateHints'] === true,
    targetDurability: parseTunable(one['targetDurability'], 100),
    strikeLimit: parseTunable(one['strikeLimit'], 7),
    chargeDurationMs: parseTunable(one['chargeDurationMs'], 1_500),
    idealPowerPercent: parseTunable(one['idealPowerPercent'], 78),
    perfectWindowPercent: parseTunable(one['perfectWindowPercent'], 10),
    goodWindowPercent: parseTunable(one['goodWindowPercent'], 30),
    perfectDamage: parseTunable(one['perfectDamage'], 34),
    goodDamage: parseTunable(one['goodDamage'], 20),
    weakDamage: parseTunable(one['weakDamage'], 6),
    wrongSideDamagePercent: parseTunable(one['wrongSideDamagePercent'], 25),
    recoveryMs: parseTunable(one['recoveryMs'], 650)
  }
}

export default { kind: 'powerstrike', create: newPowerStrikeMinigame, parse: parsePowerStrike } as const
