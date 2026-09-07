// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

import { newId } from '../../../ids'
import { minigameName, tuned, record, text, mediaRef, parseTunable } from '../common'
import type { GalleryMediaRef } from '../../galleryDoc'
import type { TunableNumber } from '../common'

export interface CarryMinigame {
  /** `mng_…`. Stable across display/name changes. */
  id: string
  kind: 'carry'
  /** Ink-safe name used by `# minigame:`. */
  name: string
  display: string
  description: string
  /** Optional concrete background look rendered behind the yard. */
  background: GalleryMediaRef | null
  /** Optional still look for the carried load; absent draws a readable shape. */
  loadArt: GalleryMediaRef | null
  /** Existing text variable set to `victory` or `defeat`. */
  resultVariable: string
  /** Transient instructions and stumble feedback. */
  showStateHints: boolean
  /** How long the walk lasts. Reaching the end with stamina left is the win. */
  distanceMs: TunableNumber
  staminaMax: TunableNumber
  /** Stamina lost per second while upright and centred. */
  staminaDrainPerSecond: TunableNumber
  /** How fast the load leans on its own, in tilt units per second. */
  wobbleDriftPerSecond: TunableNumber
  /** Tilt at which the load is dropped, measured either side of centre. */
  wobbleLimit: TunableNumber
  /** Tilt recovered by one correction. */
  correctionStrength: TunableNumber
  /** How much a fully leaning load multiplies the stamina drain. */
  tiltDrainMultiplier: TunableNumber
}

export function newCarryMinigame(name: string): CarryMinigame {
  return {
    id: newId('mng'),
    kind: 'carry',
    name: minigameName(name),
    display: name.trim(),
    description: '',
    background: null,
    loadArt: null,
    resultVariable: '',
    showStateHints: true,
    distanceMs: tuned(24_000),
    staminaMax: tuned(100),
    staminaDrainPerSecond: tuned(3),
    wobbleDriftPerSecond: tuned(18),
    wobbleLimit: tuned(100),
    correctionStrength: tuned(14),
    tiltDrainMultiplier: tuned(4)
  }
}

export function parseCarry(value: unknown): CarryMinigame | null {
  const one = record(value)
  if (!one || one['kind'] !== 'carry') return null
  const name = minigameName(text(one['name']))
  if (name.length === 0) return null
  return {
    id: text(one['id']) || newId('mng'),
    kind: 'carry',
    name,
    display: text(one['display']) || name,
    description: text(one['description']),
    background: mediaRef(one['background']),
    loadArt: mediaRef(one['loadArt']),
    resultVariable: text(one['resultVariable']),
    showStateHints: one['showStateHints'] === true,
    distanceMs: parseTunable(one['distanceMs'], 24_000),
    staminaMax: parseTunable(one['staminaMax'], 100),
    staminaDrainPerSecond: parseTunable(one['staminaDrainPerSecond'], 3),
    wobbleDriftPerSecond: parseTunable(one['wobbleDriftPerSecond'], 18),
    wobbleLimit: parseTunable(one['wobbleLimit'], 100),
    correctionStrength: parseTunable(one['correctionStrength'], 14),
    tiltDrainMultiplier: parseTunable(one['tiltDrainMultiplier'], 4)
  }
}

export default { kind: 'carry', create: newCarryMinigame, parse: parseCarry } as const
