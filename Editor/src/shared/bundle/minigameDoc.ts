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

/**
 * Carrying a load across a yard without dropping it.
 *
 * Conditioning rather than a fight, which is what a health reward should mean:
 * a wobble that drifts on its own and is corrected left or right, and a stamina
 * bar that drains faster the further off-centre the load sits.
 *
 * The stamina bar is deliberately *not* bound to an ink variable, unlike
 * combat's `playerHealthVariable`. Combat binds one because it permanently
 * subtracts from it; an exercise that left the player worse off than when they
 * started would be absurd, so the bar stays inside the scene the way
 * quick-hands keeps its score.
 */
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

/**
 * Committing force at the right moment against a chosen side of a target.
 *
 * Unlike quick-hands' spatial reaction and the carry's continuous correction,
 * this is a deliberate charge-and-release: read the marked side, build power,
 * and release near the ideal point before the swing becomes overextended.
 */
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

/** Discriminated so each runtime can grow without making the others accept its fields. */
export type MinigameDefinition =
  | CombatMinigame
  | QuickhandsMinigame
  | CarryMinigame
  | PowerStrikeMinigame

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

/**
 * A set of looks, from either spelling.
 *
 * The field held one picture before it held a set, and projects written by the
 * older editor are still on disk. A bare object reads as a set of one rather
 * than being dropped, so nothing has to be migrated and a file half of each
 * shape still comes back whole — the same tolerance the other catalogues use.
 */
function mediaRefList(value: unknown): GalleryMediaRef[] {
  const many = Array.isArray(value) ? value : [value]
  return many.flatMap((one) => {
    const ref = mediaRef(one)
    return ref ? [ref] : []
  })
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

function parseCarry(value: unknown): CarryMinigame | null {
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

function parsePowerStrike(value: unknown): PowerStrikeMinigame | null {
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

/** Tolerant like every other authored catalogue: one broken row does not hide the rest. */
export function parseMinigames(json: string): MinigameDocument {
  try {
    const top = record(JSON.parse(json))
    if (!top) return emptyMinigames()
    return {
      version: 1,
      minigames: Array.isArray(top['minigames'])
        ? top['minigames'].flatMap((value) => {
            const game = parseCombat(value) ?? parseQuickhands(value) ?? parseCarry(value) ??
              parsePowerStrike(value)
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
