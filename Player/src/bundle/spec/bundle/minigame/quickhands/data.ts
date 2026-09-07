// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

import { newId } from '../../../ids'
import { minigameName, tuned, record, text, mediaRef, parseTunable, mediaRefList } from '../common'
import type { GalleryMediaRef } from '../../galleryDoc'
import type { TunableNumber } from '../common'

export interface QuickhandsMinigame {
  /** `mng_…`. Stable across display/name changes. */
  id: string
  kind: 'quickhands'
  /** Ink-safe name used by `# minigame:`. */
  name: string
  display: string
  description: string
  /** Optional concrete background look rendered behind the lanes. */
  background: GalleryMediaRef | null
  /**
   * Still animation looks for the falling objects. Empty means the player draws
   * its own readable shapes, which is what an unfinished cabinet gets.
   *
   * A set rather than one picture because a lane full of identical tokens reads
   * as a test pattern. Given several, the game picks one of each kind for the
   * round, so the same cabinet looks different twice running without the author
   * scripting any of it.
   */
  targetArt: GalleryMediaRef[]
  hazardArt: GalleryMediaRef[]
  /** The catcher is the player's own hand, so it stays a single picture. */
  catcherArt: GalleryMediaRef | null
  /** Existing text variable set to `victory` or `defeat`. */
  resultVariable: string
  /** Transient instructions and catch/miss feedback. */
  showStateHints: boolean
  laneCount: TunableNumber
  roundDurationMs: TunableNumber
  spawnIntervalMs: TunableNumber
  fallDurationMs: TunableNumber
  /** Time on either side of the catch line during which an object can be caught. */
  catchWindowMs: TunableNumber
  targetChancePercent: TunableNumber
  goalScore: TunableNumber
  targetPoints: TunableNumber
  hazardPenalty: TunableNumber
  missedTargetPenalty: TunableNumber
}

export function newQuickhandsMinigame(name: string): QuickhandsMinigame {
  return {
    id: newId('mng'),
    kind: 'quickhands',
    name: minigameName(name),
    display: name.trim(),
    description: '',
    background: null,
    targetArt: [],
    hazardArt: [],
    catcherArt: null,
    resultVariable: '',
    showStateHints: true,
    laneCount: tuned(3),
    roundDurationMs: tuned(30_000),
    spawnIntervalMs: tuned(900),
    fallDurationMs: tuned(3_000),
    catchWindowMs: tuned(550),
    targetChancePercent: tuned(72),
    goalScore: tuned(24),
    targetPoints: tuned(2),
    hazardPenalty: tuned(3),
    missedTargetPenalty: tuned(1)
  }
}

export function parseQuickhands(value: unknown): QuickhandsMinigame | null {
  const one = record(value)
  if (!one || one['kind'] !== 'quickhands') return null
  const name = minigameName(text(one['name']))
  if (name.length === 0) return null
  return {
    id: text(one['id']) || newId('mng'),
    kind: 'quickhands',
    name,
    display: text(one['display']) || name,
    description: text(one['description']),
    background: mediaRef(one['background']),
    targetArt: mediaRefList(one['targetArt']),
    hazardArt: mediaRefList(one['hazardArt']),
    catcherArt: mediaRef(one['catcherArt']),
    resultVariable: text(one['resultVariable']),
    showStateHints: one['showStateHints'] === true,
    laneCount: parseTunable(one['laneCount'], 3),
    roundDurationMs: parseTunable(one['roundDurationMs'], 30_000),
    spawnIntervalMs: parseTunable(one['spawnIntervalMs'], 900),
    fallDurationMs: parseTunable(one['fallDurationMs'], 3_000),
    catchWindowMs: parseTunable(one['catchWindowMs'], 550),
    targetChancePercent: parseTunable(one['targetChancePercent'], 72),
    goalScore: parseTunable(one['goalScore'], 24),
    targetPoints: parseTunable(one['targetPoints'], 2),
    hazardPenalty: parseTunable(one['hazardPenalty'], 3),
    missedTargetPenalty: parseTunable(one['missedTargetPenalty'], 1)
  }
}

export default { kind: 'quickhands', create: newQuickhandsMinigame, parse: parseQuickhands } as const
