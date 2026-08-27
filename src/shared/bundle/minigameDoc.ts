import { newId } from '../ids'
import type { GalleryMediaRef } from './galleryDoc'

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

/** One numeric stat contributing to a combat parameter. */
export interface StatModifier {
  stat: string
  perPoint: number
}

/** A base value plus any number of deliberately simple stat contributions. */
export interface TunableNumber {
  base: number
  modifiers: StatModifier[]
}

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
  /** Optional still animation looks; the player supplies readable shapes when absent. */
  targetArt: GalleryMediaRef | null
  hazardArt: GalleryMediaRef | null
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

/** Discriminated so each runtime can grow without making the others accept its fields. */
export type MinigameDefinition = CombatMinigame | QuickhandsMinigame

export interface MinigameDocument {
  version: 1
  minigames: MinigameDefinition[]
}

export function emptyMinigames(): MinigameDocument {
  return { version: 1, minigames: [] }
}

export function minigameName(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

const tuned = (base: number): TunableNumber => ({ base, modifiers: [] })

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

export function newQuickhandsMinigame(name: string): QuickhandsMinigame {
  return {
    id: newId('mng'),
    kind: 'quickhands',
    name: minigameName(name),
    display: name.trim(),
    description: '',
    background: null,
    targetArt: null,
    hazardArt: null,
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

/** Runtime value; missing/non-numeric stats contribute zero rather than crashing a game. */
export function resolveTunable(
  value: TunableNumber,
  stat: (name: string) => number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
): number {
  const resolved = value.modifiers.reduce(
    (total, modifier) => total + stat(modifier.stat) * modifier.perPoint,
    value.base
  )
  return Math.min(max, Math.max(min, Math.round(resolved)))
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

function mediaRef(value: unknown): GalleryMediaRef | null {
  const one = record(value)
  if (!one) return null
  const assetId = text(one['assetId']).trim()
  const variantId = text(one['variantId']).trim()
  return assetId && variantId ? { assetId, variantId } : null
}

function parseTunable(value: unknown, fallback: number): TunableNumber {
  const one = record(value)
  if (!one) return tuned(fallback)
  const modifiers = Array.isArray(one['modifiers'])
    ? one['modifiers'].flatMap((candidate): StatModifier[] => {
        const modifier = record(candidate)
        if (!modifier) return []
        const stat = text(modifier['stat']).trim()
        const perPoint = number(modifier['perPoint'], Number.NaN)
        return stat.length > 0 && Number.isFinite(perPoint) ? [{ stat, perPoint }] : []
      })
    : []
  return { base: number(one['base'], fallback), modifiers }
}

function parseCombat(value: unknown): CombatMinigame | null {
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

function parseQuickhands(value: unknown): QuickhandsMinigame | null {
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
    targetArt: mediaRef(one['targetArt']),
    hazardArt: mediaRef(one['hazardArt']),
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

/** Tolerant like every other authored catalogue: one broken row does not hide the rest. */
export function parseMinigames(json: string): MinigameDocument {
  try {
    const top = record(JSON.parse(json))
    if (!top) return emptyMinigames()
    return {
      version: 1,
      minigames: Array.isArray(top['minigames'])
        ? top['minigames'].flatMap((value) => {
            const game = parseCombat(value) ?? parseQuickhands(value)
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
