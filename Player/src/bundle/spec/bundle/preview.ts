// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

/**
 * A transient Ink state used only when InkCrafter opens the connected player.
 *
 * This is deliberately smaller than the player's durable save format. It is
 * captured before the target paragraph is consumed, so the player's ordinary
 * story loop still applies that paragraph's tags and one-shot effects exactly
 * once.
 */

export const PREVIEW_CHECKPOINT_FORMAT = 1

export interface PreviewCheckpoint {
  format: typeof PREVIEW_CHECKPOINT_FORMAT
  /** Identifies one preview invocation and doubles as its cache buster. */
  id: string
  /** The project and exact compiled story this state belongs to. */
  bundleId: string
  contentHash: string
  /** Knot or stitch selected in the editor; null means the story beginning. */
  target: string | null
  /** `StoryState.ToJson()`, captured before the first target continuation. */
  inkState: string
}

export function serialisePreviewCheckpoint(checkpoint: PreviewCheckpoint): string {
  return `${JSON.stringify(checkpoint, null, 2)}\n`
}

/** A strict reader: a stale or malformed preview must never open at the wrong place. */
export function parsePreviewCheckpoint(json: string): PreviewCheckpoint | null {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return null
  }

  if (!value || typeof value !== 'object') return null
  const one = value as Record<string, unknown>
  if (
    one.format !== PREVIEW_CHECKPOINT_FORMAT ||
    typeof one.id !== 'string' ||
    one.id.length === 0 ||
    typeof one.bundleId !== 'string' ||
    typeof one.contentHash !== 'string' ||
    (one.target !== null && typeof one.target !== 'string') ||
    typeof one.inkState !== 'string'
  ) {
    return null
  }

  return one as unknown as PreviewCheckpoint
}
