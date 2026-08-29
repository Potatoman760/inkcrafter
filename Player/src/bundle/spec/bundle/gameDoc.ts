// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

import type { GalleryMediaRef } from './galleryDoc'

/**
 * Settings that belong to the game rather than to any story beat.
 *
 * `game.json`, beside the other catalogues, and the first of them that nothing
 * in the ink can reach: a knot cannot set the picture behind the title screen,
 * because the title screen is what the reader sees before there is a story.
 * That is the test for whether something belongs here — the player needs it
 * before, or regardless of, where the reader has got to.
 */
export interface GameDocument {
  version: 1
  /**
   * The picture behind the launch menu, or null for the plain colour.
   *
   * A reference to a catalogued background rather than a path, so the file is
   * one the export already copies and the picker can only offer pictures that
   * exist.
   */
  startupBackground: GalleryMediaRef | null
  title: LauncherTitle
}

/**
 * The game's name as the launch menu draws it.
 *
 * Defaults are the values the menu used to hard-code, so a project that has
 * never opened this panel looks exactly as it did.
 */
export interface LauncherTitle {
  /** Blank means the project's own title, which is what most games want. */
  text: string
  /** Hex, as CSS writes it. */
  color: string
  /** Point size of the drawn text. */
  size: number
  /**
   * A picture drawn instead of the words.
   *
   * A wordmark is a picture of a name, not a name in a font — no size or colour
   * can turn one into the other. So this replaces the text rather than joining
   * it, and the three settings above stop applying when it is set.
   */
  art: GalleryMediaRef | null
}

export const TITLE_DEFAULTS: LauncherTitle = {
  text: '',
  color: '#ffd98a',
  size: 64,
  art: null
}

export function emptyGame(): GameDocument {
  return { version: 1, startupBackground: null, title: { ...TITLE_DEFAULTS } }
}

/** Reads a game document, tolerating anything, like every other catalogue. */
export function parseGame(json: string): GameDocument {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyGame()
    const record = parsed as Record<string, unknown>

    return {
      version: 1,
      startupBackground: mediaRef(record['startupBackground']),
      title: title(record['title'])
    }
  } catch {
    return emptyGame()
  }
}

export function serialiseGame(doc: GameDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}

/** Hex as CSS writes it: `#abc`, `#aabbcc`, or either with alpha. */
const HEX = /^#[0-9a-fA-F]{3,8}$/

function title(value: unknown): LauncherTitle {
  if (typeof value !== 'object' || value === null) return { ...TITLE_DEFAULTS }
  const record = value as Record<string, unknown>

  const color = typeof record['color'] === 'string' ? record['color'].trim() : ''
  const size = typeof record['size'] === 'number' ? Math.round(record['size']) : Number.NaN

  return {
    text: typeof record['text'] === 'string' ? record['text'] : TITLE_DEFAULTS.text,
    // A colour the renderer cannot read draws nothing at all, which reads as a
    // missing title rather than as a bad setting.
    color: HEX.test(color) ? color : TITLE_DEFAULTS.color,
    size: Number.isFinite(size) ? Math.min(240, Math.max(8, size)) : TITLE_DEFAULTS.size,
    art: mediaRef(record['art'])
  }
}

function mediaRef(value: unknown): GalleryMediaRef | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const assetId = typeof record['assetId'] === 'string' ? record['assetId'].trim() : ''
  const variantId = typeof record['variantId'] === 'string' ? record['variantId'].trim() : ''
  return assetId && variantId ? { assetId, variantId } : null
}
