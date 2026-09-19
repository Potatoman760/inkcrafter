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
  /** Show the one-time 18+ declaration before the reader can reach the title screen. */
  requireAdultConfirmation: boolean
  /** Icon shown by an exported desktop game's native shell. */
  desktopIcon: DesktopIcon | null
  /** Optional player-facing release number, drawn on the launch screen. */
  releaseVersion: string
  /**
   * The picture behind the launch menu, or null for the plain colour.
   *
   * A reference to a catalogued background rather than a path, so the file is
   * one the export already copies and the picker can only offer pictures that
   * exist.
   */
  startupBackground: GalleryMediaRef | null
  title: LauncherTitle
  dialogue: DialoguePresentation
}

export type DesktopIcon =
  | { kind: 'media'; ref: GalleryMediaRef }
  | { kind: 'file'; file: string }

export const DIALOGUE_FONT_OPTIONS = [
  { id: 'system', label: 'System sans', family: 'system-ui, sans-serif' },
  { id: 'sans', label: 'Sans serif', family: 'sans-serif' },
  { id: 'serif', label: 'Serif', family: 'serif' },
  { id: 'mono', label: 'Monospace', family: 'monospace' },
  { id: 'cursive', label: 'Cursive', family: 'cursive' },
  { id: 'fantasy', label: 'Display', family: 'fantasy' }
] as const

export type BuiltinDialogueFont = (typeof DIALOGUE_FONT_OPTIONS)[number]['id']
export type DialogueFont = BuiltinDialogueFont | 'custom'

export interface DialogueTextStyle {
  font: DialogueFont
  /** Project-relative `fonts/…` path when `font` is `custom`. */
  file: string | null
  /** Base pixels at the player's Normal accessibility size. */
  size: number
}

export interface DialoguePresentation {
  /** Turn a leading `Name: ` into a speaker label and remove it from the body. */
  separateNames: boolean
  text: DialogueTextStyle
  name: DialogueTextStyle
}

export const DIALOGUE_SIZE_MIN = 12
export const DIALOGUE_SIZE_MAX = 64

export const DIALOGUE_DEFAULTS: DialoguePresentation = {
  separateNames: false,
  text: { font: 'system', file: null, size: 23 },
  name: { font: 'system', file: null, size: 24 }
}

export function customDialogueFontName(file: string): string {
  return `InkCrafter_${file.replace(/[^a-zA-Z0-9]+/g, '_')}`
}

export function dialogueFontFamily(style: DialogueTextStyle): string {
  if (style.font === 'custom' && style.file) {
    return `"${customDialogueFontName(style.file)}", sans-serif`
  }
  return DIALOGUE_FONT_OPTIONS.find((option) => option.id === style.font)?.family ?? 'sans-serif'
}

export interface DisplayDialogueLine {
  speaker: string
  text: string
}

/** Remove one pair of authored speech marks around a complete dialogue body. */
function stripDialogueQuotes(text: string): string {
  const body = text.trim()
  const quoted =
    (body.startsWith('"') && body.endsWith('"')) ||
    (body.startsWith('“') && body.endsWith('”'))
  if (!quoted || body.length < 2) return text

  const start = text.indexOf(body)
  return text.slice(0, start) + body.slice(1, -1) + text.slice(start + body.length)
}

/**
 * Split authored `Name: dialogue` prose only when the game opts into it.
 *
 * The embedded name wins over a carried `# speaker:` tag for this line: tags
 * are persistent scene state, while the name printed directly on a line is
 * the most specific statement of who says these particular words.
 */
export function splitDialogueLine(
  taggedSpeaker: string,
  text: string,
  separateNames: boolean
): DisplayDialogueLine {
  const match = /^(\s*([^:\n]{1,32}):(?:\s+|$))([\s\S]*)$/.exec(text)
  const candidate = match?.[2]?.trim() ?? ''
  const embeddedSpeaker = candidate.length > 0 && !/[.!?,;"]/.test(candidate)

  if (!separateNames) {
    const displayed = embeddedSpeaker
      ? `${match?.[1] ?? ''}${stripDialogueQuotes(match?.[3] ?? '')}`
      : taggedSpeaker.trim().length > 0
        ? stripDialogueQuotes(text)
        : text
    return { speaker: taggedSpeaker, text: displayed }
  }

  if (!embeddedSpeaker) {
    return { speaker: taggedSpeaker, text: taggedSpeaker.trim().length > 0 ? stripDialogueQuotes(text) : text }
  }

  return { speaker: candidate, text: stripDialogueQuotes(match?.[3] ?? '') }
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
  return {
    version: 1,
    requireAdultConfirmation: true,
    desktopIcon: null,
    releaseVersion: '',
    startupBackground: null,
    title: { ...TITLE_DEFAULTS },
    dialogue: {
      ...DIALOGUE_DEFAULTS,
      text: { ...DIALOGUE_DEFAULTS.text },
      name: { ...DIALOGUE_DEFAULTS.name }
    }
  }
}

/** Reads a game document, tolerating anything, like every other catalogue. */
export function parseGame(json: string): GameDocument {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyGame()
    const record = parsed as Record<string, unknown>

    return {
      version: 1,
      // Existing games gain the declaration when this setting is absent. An
      // author has to turn it off deliberately in the game configuration.
      requireAdultConfirmation: record['requireAdultConfirmation'] !== false,
      desktopIcon: desktopIcon(record['desktopIcon']),
      releaseVersion: releaseVersion(record['releaseVersion']),
      startupBackground: mediaRef(record['startupBackground']),
      title: title(record['title']),
      dialogue: dialogue(record['dialogue'])
    }
  } catch {
    return emptyGame()
  }
}

/** Kept short enough to remain a corner label at every supported resolution. */
function releaseVersion(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 32) : ''
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

function dialogue(value: unknown): DialoguePresentation {
  if (typeof value !== 'object' || value === null) return emptyGame().dialogue
  const record = value as Record<string, unknown>

  return {
    separateNames: record['separateNames'] === true,
    text: dialogueStyle(record['text'], DIALOGUE_DEFAULTS.text),
    name: dialogueStyle(record['name'], DIALOGUE_DEFAULTS.name)
  }
}

function dialogueStyle(value: unknown, fallback: DialogueTextStyle): DialogueTextStyle {
  if (typeof value !== 'object' || value === null) return { ...fallback }
  const record = value as Record<string, unknown>
  const file = fontFile(record['file'])
  const font = dialogueFont(record['font'], file, fallback.font)
  const size = typeof record['size'] === 'number' ? Math.round(record['size']) : Number.NaN
  return {
    font,
    file,
    size: Number.isFinite(size)
      ? Math.min(DIALOGUE_SIZE_MAX, Math.max(DIALOGUE_SIZE_MIN, size))
      : fallback.size
  }
}

function dialogueFont(value: unknown, file: string | null, fallback: DialogueFont): DialogueFont {
  if (value === 'custom') return file ? 'custom' : fallback
  if (DIALOGUE_FONT_OPTIONS.some((option) => option.id === value)) return value as BuiltinDialogueFont
  // Values written by the first font-picker release named OS-specific fonts.
  // They remain readable, but resolve to a generic family every platform has.
  if (value === 'arial' || value === 'rounded' || value === 'impact') return 'sans'
  return fallback
}

const FONT_FILE = /^fonts\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:woff2?|ttf|otf)$/i
const ICON_FILE = /^icons\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:png|jpe?g)$/i

function fontFile(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().split('\\').join('/')
  return FONT_FILE.test(clean) ? clean : null
}

function desktopIcon(value: unknown): DesktopIcon | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (record['kind'] === 'media') {
    const ref = mediaRef(record['ref'])
    return ref ? { kind: 'media', ref } : null
  }
  if (record['kind'] === 'file' && typeof record['file'] === 'string') {
    const file = record['file'].trim().split('\\').join('/')
    return ICON_FILE.test(file) ? { kind: 'file', file } : null
  }
  return null
}

function mediaRef(value: unknown): GalleryMediaRef | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const assetId = typeof record['assetId'] === 'string' ? record['assetId'].trim() : ''
  const variantId = typeof record['variantId'] === 'string' ? record['variantId'].trim() : ''
  return assetId && variantId ? { assetId, variantId } : null
}
