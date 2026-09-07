import type { GalleryMediaRef } from '../galleryDoc'

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
export function minigameName(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

export const tuned = (base: number): TunableNumber => ({ base, modifiers: [] })
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

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

export const text = (value: unknown): string => typeof value === 'string' ? value : ''
export const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function mediaRef(value: unknown): GalleryMediaRef | null {
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
export function mediaRefList(value: unknown): GalleryMediaRef[] {
  const many = Array.isArray(value) ? value : [value]
  return many.flatMap((one) => {
    const ref = mediaRef(one)
    return ref ? [ref] : []
  })
}

export function parseTunable(value: unknown, fallback: number): TunableNumber {
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
