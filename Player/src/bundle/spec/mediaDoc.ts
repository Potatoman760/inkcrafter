// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

import { newId } from './ids'
export { COMBATANT_STATES } from './bundle/minigameDoc'

/**
 * The media catalogue: which characters and backgrounds this story has, and
 * which file each of their looks is.
 *
 * The third catalogue, and the one with the least to say to the ink. Stats
 * generate `VAR` declarations and items generate `LIST`s; media generate
 * nothing. A sprite reaches the story as a *tag* — `# char:wren/happy` — which
 * the author writes and inkjs hands back through `currentTags` untouched. So
 * this file exists to make those tags writable, checkable and renderable, and
 * to hold everything about an image that ink has no way to express.
 *
 * Videos are catalogued alongside them. A clip is not a "look", but it is the
 * same shape — a name the story writes and a file on disk — and giving it its
 * own document would duplicate all of this to save one field.
 *
 * A character is one asset with named variants rather than one asset per image.
 * `wren` with `neutral`, `happy` and `angry` is how a visual novel is actually
 * written; three unrelated entries called `wren_happy`, `wren_sad` and
 * `wren_angry` have nothing tying them together and nothing to offer a picker.
 */

/**
 * A kind says what an asset is *for*, never what its file is.
 *
 * There was a `video` kind once, played by `# play:` and gone when it ended.
 * It was removed: a clip is either something the scene is set against or
 * something happening over it, and `background` and `animation` are those two.
 * Both take a still or a looping file, so the distinction the kind was drawing
 * turned out to be about the file rather than about the story — and
 * `isVideoFile` answers that better than a catalogue entry can.
 */
export type MediaKind =
  | 'character'
  | 'animation'
  | 'background'
  | 'music'
  | 'sound'
  | 'hotspot'
  | 'combatant'

export const MEDIA_KINDS: readonly MediaKind[] = [
  'character',
  'animation',
  'background',
  'music',
  'sound',
  'hotspot',
  'combatant'
]

/**
 * The looks a hotspot has, and the only ones it may have.
 *
 * Fixed rather than free text because nothing reads them but the map, which
 * asks for them by name — a look called `hovr` would be art that never draws,
 * and nothing anywhere would say so.
 */
export const HOTSPOT_STATES = ['idle', 'hover', 'active', 'disabled'] as const

export type HotspotState = (typeof HOTSPOT_STATES)[number]

/** Where the files live inside a project. */
export const MEDIA_DIR = 'media'

/**
 * Files the app plays rather than draws.
 *
 * A kind says what an asset is *for*; this says what a file *is*, which is not
 * the same question — a background may perfectly well be a looping clip, and so
 * may an animation. Anything showing a file has to ask this, because an <img>
 * pointed at an .mp4 renders as a broken icon and says nothing about why.
 *
 * This question outliving the `video` kind is the whole reason that kind went:
 * the file already knew, and the catalogue was answering a different question
 * badly.
 */
const VIDEO_EXTENSIONS = ['.mp4', '.webm'] as const

export function isVideoFile(file: string): boolean {
  // Preview assets carry a revision query (`clip.mp4?preview=<id>`) so every
  // file in one launch comes from the same export. The query belongs to the
  // URL, not its media type; treating it as part of the extension turns a
  // perfectly valid preview clip into an image and displays a missing texture.
  const lower = file.split(/[?#]/, 1)[0]!.toLowerCase()
  return VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/**
 * Files there is nothing to look at.
 *
 * A third answer to the same question, and the reason it is a third rather
 * than a flag: a picture is drawn, a clip is drawn and played, and a track is
 * only played. Anything showing a file has to know which of the three it has,
 * because an <img> pointed at an .mp3 renders as a broken icon and says
 * nothing about why.
 */
const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus'] as const

export function isAudioFile(file: string): boolean {
  const lower = file.toLowerCase()
  return AUDIO_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/**
 * Files the white card can be taken out of.
 *
 * A narrower question than the three above, and asked for a different reason:
 * those say what a file *is*, this says what may be *done* to one. PNG only,
 * on purpose. A JPEG may carry an EXIF orientation the decoder quietly applies,
 * and the result would be written back rotated; a GIF or a WebP may be
 * animated, and only the first frame would survive. Neither is a fringe case
 * worth a silent wrong answer, and both are one `Save as PNG` away.
 */
export function isKeyableFile(file: string): boolean {
  return file.toLowerCase().endsWith('.png')
}

/**
 * Where each kind's files live under `media/`.
 *
 * A folder for the kind and a folder per asset inside it, so a character's
 * eight expressions sit together rather than being eight names in a pile of
 * two hundred. It is also what makes a picture's path readable on its own:
 * `characters/kael/happy.png` says what it is without the catalogue open.
 *
 * Only where the app puts things. A file already filed somewhere else stays
 * catalogued and keeps working — the arrangement is a convention for what the
 * app writes, not a rule about what it can read.
 */
export const KIND_FOLDERS: Record<MediaKind, string> = {
  character: 'characters',
  animation: 'animations',
  background: 'backgrounds',
  music: 'music',
  sound: 'sounds',
  hotspot: 'hotspots',
  combatant: 'combatants'
}

/** Where one asset's looks belong: `characters/kael`. */
export function assetFolder(kind: MediaKind, name: string): string {
  return `${KIND_FOLDERS[kind]}/${mediaName(name)}`
}

/**
 * What a look's file should be called, keeping whatever the source was.
 *
 * The extension travels: a clip stays a clip, and a webp stays a webp. The
 * name does not — it becomes the look's, because that is the thing the author
 * will be looking for when they open the folder.
 */
export function lookFile(kind: MediaKind, asset: string, look: string, source: string): string {
  const dot = source.lastIndexOf('.')
  const extension = dot === -1 ? '.png' : source.slice(dot).toLowerCase()
  const stem = mediaName(look) || 'default'
  return `${assetFolder(kind, asset)}/${stem}${extension}`
}

export interface MediaVariant {
  id: string
  /** The ink identifier for this look: `happy`. */
  name: string
  /** Path under the project's `media/`, e.g. `characters/wren/happy.png`. */
  file: string
}

/** Audio assets are named files, not collections of visual-style looks. */
export const SINGLE_FILE_MEDIA_KINDS: readonly MediaKind[] = ['music', 'sound']

export function isSingleFileMediaKind(kind: MediaKind): boolean {
  return SINGLE_FILE_MEDIA_KINDS.includes(kind)
}

/** Runtime name for one audio file; never shown or written as a look. */
export const SINGLE_FILE_VARIANT = 'default'

export interface MediaAsset {
  /** `med_…`. Stable across renames. */
  id: string
  kind: MediaKind
  /** The ink identifier: `wren`. Unique among assets of the same kind. */
  name: string
  /** Shown to the player, where the name is for the tag. */
  display: string
  /** For the author. */
  description: string
  /** Free-form, for finding things once there are two hundred. */
  tags: string[]
  variants: MediaVariant[]
}

export interface MediaDocument {
  version: 1
  assets: MediaAsset[]
}

export function emptyMedia(): MediaDocument {
  return { version: 1, assets: [] }
}

/**
 * An ink identifier from free text. Shared in spirit with the stats catalogue's
 * `inkName`, but kept separate: a media name lands inside a *tag*, where `/` and
 * `:` are the delimiters and so must not survive, and the two could reasonably
 * diverge later without one dragging the other with it.
 */
export function mediaName(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

export function newVariant(name: string, file: string): MediaVariant {
  return { id: newId('med'), name: mediaName(name), file }
}

export function newAsset(name: string, kind: MediaKind): MediaAsset {
  return {
    id: newId('med'),
    kind,
    name: mediaName(name),
    display: name.trim(),
    description: '',
    tags: [],
    variants: []
  }
}

/* Operations. Each returns a whole new document; none mutates. */

export function addAsset(doc: MediaDocument, asset: MediaAsset): MediaDocument {
  return { ...doc, assets: [...doc.assets, asset] }
}

export function updateAsset(
  doc: MediaDocument,
  id: string,
  changes: Partial<MediaAsset>
): MediaDocument {
  return {
    ...doc,
    assets: doc.assets.map((asset) => (asset.id === id ? { ...asset, ...changes } : asset))
  }
}

export function removeAsset(doc: MediaDocument, id: string): MediaDocument {
  return { ...doc, assets: doc.assets.filter((asset) => asset.id !== id) }
}

export function addVariant(
  doc: MediaDocument,
  assetId: string,
  variant: MediaVariant
): MediaDocument {
  return updateAssetBy(doc, assetId, (asset) => ({
    ...asset,
    variants: [...asset.variants, variant]
  }))
}

export function updateVariant(
  doc: MediaDocument,
  assetId: string,
  variantId: string,
  changes: Partial<MediaVariant>
): MediaDocument {
  return updateAssetBy(doc, assetId, (asset) => ({
    ...asset,
    variants: asset.variants.map((variant) =>
      variant.id === variantId ? { ...variant, ...changes } : variant
    )
  }))
}

export function removeVariant(
  doc: MediaDocument,
  assetId: string,
  variantId: string
): MediaDocument {
  return updateAssetBy(doc, assetId, (asset) => ({
    ...asset,
    variants: asset.variants.filter((variant) => variant.id !== variantId)
  }))
}

/**
 * Gives a single-file asset its file, replacing any legacy variants.
 *
 * Audio still becomes one runtime variant
 * so the bundle and player keep their existing lookup contract, but the
 * authored catalogue and UI no longer pretend that file is a named look.
 */
export function setMediaFile(doc: MediaDocument, assetId: string, file: string): MediaDocument {
  return updateAssetBy(doc, assetId, (asset) => {
    const clean = file.trim().split('\\').join('/')
    if (clean.length === 0) return { ...asset, variants: [] }

    const current = asset.variants[0]
    return {
      ...asset,
      variants: [
        {
          id: current?.id ?? newId('med'),
          // Preserve an old explicit music suffix so authored tags using it
          // keep resolving. New tracks have no suffix and use `default` only
          // inside the compatibility layer.
          name: current?.name || SINGLE_FILE_VARIANT,
          file: clean
        }
      ]
    }
  })
}

/** Follows files an upload gathered into an asset folder. */
export function relocateMediaFiles(
  doc: MediaDocument,
  moved: { from: string; to: string }[]
): MediaDocument {
  const relocated = new Map(moved.map((one) => [one.from, one.to]))
  if (relocated.size === 0) return doc

  return {
    ...doc,
    assets: doc.assets.map((asset) => ({
      ...asset,
      variants: asset.variants.map((variant) =>
        relocated.has(variant.file)
          ? { ...variant, file: relocated.get(variant.file)! }
          : variant
      )
    }))
  }
}

/**
 * Moves a variant within its asset. The first variant is what a bare
 * `# char:wren` resolves to, so order is not only presentation.
 */
export function moveVariant(
  doc: MediaDocument,
  assetId: string,
  variantId: string,
  by: number
): MediaDocument {
  const asset = doc.assets.find((candidate) => candidate.id === assetId)
  if (!asset) return doc

  const from = asset.variants.findIndex((variant) => variant.id === variantId)
  const to = from + by
  if (from === -1 || to < 0 || to >= asset.variants.length) return doc

  const variants = [...asset.variants]
  const [moving] = variants.splice(from, 1)
  variants.splice(to, 0, moving!)

  return updateAssetBy(doc, assetId, (current) => ({ ...current, variants }))
}

function updateAssetBy(
  doc: MediaDocument,
  id: string,
  change: (asset: MediaAsset) => MediaAsset
): MediaDocument {
  return {
    ...doc,
    assets: doc.assets.map((asset) => (asset.id === id ? change(asset) : asset))
  }
}

/* Reading. */

export function assetsOfKind(doc: MediaDocument, kind: MediaKind): MediaAsset[] {
  return doc.assets.filter((asset) => asset.kind === kind)
}

export function findAsset(doc: MediaDocument, kind: MediaKind, name: string): MediaAsset | null {
  return doc.assets.find((asset) => asset.kind === kind && asset.name === name) ?? null
}

/** Every file the catalogue claims, for telling filed images from unfiled ones. */
export function claimedFiles(doc: MediaDocument): Set<string> {
  return new Set(doc.assets.flatMap((asset) => asset.variants.map((variant) => variant.file)))
}

export function allTags(doc: MediaDocument): string[] {
  return [...new Set(doc.assets.flatMap((asset) => asset.tags))].sort((a, b) => a.localeCompare(b))
}

/**
 * Why this name cannot be used, or null when it can.
 *
 * Names only have to be unique *within a kind*: the tag carries the kind, so a
 * background and a character may both be called `the_cove` without ambiguity.
 */
export function assetNameProblem(
  doc: MediaDocument,
  kind: MediaKind,
  name: string,
  exceptId?: string
): string | null {
  const cleaned = mediaName(name)
  if (cleaned.length === 0) return 'A name needs at least one letter or digit.'

  const clash = doc.assets.find(
    (asset) => asset.kind === kind && asset.name === cleaned && asset.id !== exceptId
  )

  return clash ? `There is already a ${kind} called ${cleaned}.` : null
}

export function variantNameProblem(
  asset: MediaAsset,
  name: string,
  exceptId?: string
): string | null {
  const cleaned = mediaName(name)
  if (cleaned.length === 0) return 'A name needs at least one letter or digit.'

  const clash = asset.variants.find(
    (variant) => variant.name === cleaned && variant.id !== exceptId
  )

  return clash ? `${asset.name} already has a ${cleaned}.` : null
}

/* Persistence. */

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

function asKind(value: unknown): MediaKind {
  return MEDIA_KINDS.includes(value as MediaKind) ? (value as MediaKind) : 'character'
}

function asVariant(value: unknown): MediaVariant | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const name = mediaName(asText(record['name']))
  const file = asText(record['file']).trim()
  // A variant naming no file shows nothing; there is no sensible default.
  if (name.length === 0 || file.length === 0) return null

  return {
    id: asText(record['id']).length > 0 ? asText(record['id']) : newId('med'),
    name,
    file: file.split('\\').join('/')
  }
}

function asAsset(value: unknown): MediaAsset | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const name = mediaName(asText(record['name']))
  if (name.length === 0) return null

  const kind = asKind(record['kind'])
  const variants = Array.isArray(record['variants'])
    ? record['variants'].map(asVariant).filter((variant): variant is MediaVariant => variant !== null)
    : []
  const directFile = asText(record['file']).trim().split('\\').join('/')
  const legacyVariant = mediaName(asText(record['legacyVariant'])) || SINGLE_FILE_VARIANT

  return {
    id: asText(record['id']).length > 0 ? asText(record['id']) : newId('med'),
    kind,
    name,
    display: asText(record['display']),
    description: asText(record['description']),
    tags: Array.isArray(record['tags'])
      ? record['tags']
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [],
    // `file` is the authored audio shape. `variants` remains readable for
    // existing projects and for the bundle catalogue consumed by the player.
    variants:
      isSingleFileMediaKind(kind) && directFile.length > 0
        ? [newVariant(legacyVariant, directFile)]
        : variants
  }
}

/**
 * Parses a catalogue, tolerating anything — the same principle as the plan,
 * stats, settings and codex readers. An asset with no usable name is dropped
 * rather than guessed at, because its name is what the tag is written from.
 */
export function parseMedia(json: string): MediaDocument {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyMedia()
    const record = parsed as Record<string, unknown>

    return {
      version: 1,
      assets: Array.isArray(record['assets'])
        ? record['assets'].map(asAsset).filter((asset): asset is MediaAsset => asset !== null)
        : []
    }
  } catch {
    return emptyMedia()
  }
}

export function serialiseMedia(doc: MediaDocument): string {
  const authored = {
    ...doc,
    assets: doc.assets.map((asset) => {
      if (!isSingleFileMediaKind(asset.kind) || asset.variants.length > 1) return asset

      const { variants, ...fields } = asset
      const track = variants[0]
      return {
        ...fields,
        file: track?.file ?? '',
        ...(track && track.name !== SINGLE_FILE_VARIANT
          ? { legacyVariant: track.name }
          : {})
      }
    })
  }

  return `${JSON.stringify(authored, null, 2)}\n`
}

/**
 * Bundle compatibility shape. The player resolves every kind through runtime
 * variants, including each audio asset's synthetic default entry.
 */
export function serialiseBundleMedia(doc: MediaDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
