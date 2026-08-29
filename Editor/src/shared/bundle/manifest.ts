/**
 * The bundle: a project as a game can run it.
 *
 * InkCrafter's output is ink files on disk, which is the right format for
 * authoring and the wrong one for shipping — a player would need a compiler, a
 * file handler to resolve INCLUDEs, and a way to find the images. A bundle is
 * the same project flattened into something a runtime can read with `fetch` and
 * nothing else: compiled story JSON, the catalogues beside it, and every media
 * file it names.
 *
 *     <bundle>/
 *       manifest.json   this file's shape — read first, names the rest
 *       story.json      Story.ToJson(), compiled with countAllVisits
 *       catalogue.json  CatalogueExport, as `export/catalogue.json`
 *       media.json      MediaDocument, copied from the project
 *       gallery.json    unlockable background and animation groups
 *       achievements.json  Steam API names and Ink-global unlock conditions
 *       game.json       settings the player reads before the story starts
 *       media/…         the image and video files themselves
 *
 * Deliberately one directory of plain files rather than an archive. A player in
 * a browser can serve it as static assets, and an author can look inside it when
 * something is wrong, which is worth more than the packaging.
 */

/** Bundle-relative names, fixed rather than carried in the manifest. */
export const BUNDLE_FILES = {
  manifest: 'manifest.json',
  story: 'story.json',
  catalogue: 'catalogue.json',
  media: 'media.json',
  npcs: 'npcs.json',
  map: 'map.json',
  gallery: 'gallery.json',
  achievements: 'achievements.json',
  minigames: 'minigames.json',
  /** Settings the player needs before the story starts. */
  game: 'game.json',
  /** Present only in a connected-player preview export. */
  preview: 'preview-save.json'
} as const

/** Where media files live inside a bundle. Matches the project's own layout. */
export const BUNDLE_MEDIA_DIR = 'media'

/**
 * What a bundle's own folder may be called.
 *
 * A player serves a folder of games and picks one by name — `?game=game1` — so
 * the folder name is part of the interchange, not a local detail. Anything that
 * could climb out of the games folder (a slash, a `..`, a scheme) is not a
 * name, and a player has no way to ask for one with a space in it.
 *
 * Here rather than in the player because the editor is the side that *creates*
 * the folder, and a name it cannot serve is worth saying at export time rather
 * than discovering as a blank screen.
 */
const GAME_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function isGameId(name: string): boolean {
  return GAME_ID.test(name.trim())
}

/**
 * The interchange contract's version.
 *
 * Distinct from the *content* version below, and they fail differently. A player
 * that does not know this number cannot read the bundle at all, so a mismatch is
 * a refusal. Content changing under a save is a much softer problem.
 */
export const BUNDLE_FORMAT = 2

/**
 * The resolution media are authored against, when the project does not say.
 *
 * A visual novel's art is drawn for one canvas size and a player scales the
 * whole thing, so this is a property of the bundle rather than of the machine
 * showing it.
 */
export const DEFAULT_STAGE = { width: 1280, height: 720 } as const

/**
 * How a file is loaded, which is not the same as what it depicts.
 *
 * Three because there are three ways to load one, not because there are three
 * kinds of thing in the catalogue. Read from the file rather than from the kind
 * of asset it belongs to, because the two disagree: a background may be a
 * still or a looping clip, and only its extension says which.
 */
export type AssetKind = 'image' | 'video' | 'audio'

export interface BundleAsset {
  /** Bundle-relative, forward slashes: `media/sprites/wren-happy.png`. */
  path: string
  kind: AssetKind
  /**
   * The key a player registers the file under. Derived from the catalogue
   * rather than the filename, so it survives a file being renamed on disk and
   * is reproducible from a tag without consulting this list.
   */
  key: string
  bytes: number
}

export interface BundleManifest {
  /** Format 1 had no minigames; the current player remains able to load it. */
  format: 1 | typeof BUNDLE_FORMAT
  generatedBy: 'InkCrafter'
  /** ISO 8601. For showing "exported 5 minutes ago", not for cache-busting. */
  generatedAt: string
  project: { id: string; title: string }
  /**
   * SHA-256 of `story.json`, hex. The story's identity.
   *
   * A save holds serialised ink state, which addresses knots and variables by
   * name — so a save survives a rebuild of the same story and is nonsense
   * against a different one, and neither case changes `format`. Carrying the
   * hash lets a player notice, warn, and still offer to try.
   */
  contentHash: string
  /**
   * Every knot and `knot.stitch` the story declares, functions excluded.
   *
   * `ChoosePathString` throws on a name that is not there, and a player asking
   * it to travel somewhere has no other way to ask first. Functions are left
   * out because a function is called, never travelled to.
   */
  knots: string[]
  /** Every file under `media/`, so a player preloads without scanning a directory. */
  assets: BundleAsset[]
  /** The resolution the media were authored against. */
  stage: { width: number; height: number }
}

/**
 * A media file's key, from the names the story already uses.
 *
 * `# char:wren/happy` has to reach a loaded texture without a lookup table
 * shipped alongside it, so the key is a pure function of the tag: kind, asset
 * name, variant name. Both sides compute it and they agree by construction.
 */
export function assetKey(prefix: string, asset: string, variant: string): string {
  return [prefix, asset, variant].map(inkSafe).join('_')
}

/**
 * The subset of a name that survives into a key. Catalogue names are already
 * ink identifiers, so this only guards against a hand-edited `media.json`.
 */
function inkSafe(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return cleaned.length > 0 ? cleaned : 'unnamed'
}

/** Why this manifest cannot be used, or null when it can. */
export function manifestProblem(manifest: BundleManifest): string | null {
  if (manifest.format !== 1 && manifest.format !== BUNDLE_FORMAT) {
    return `This bundle is format ${manifest.format}; this player reads format ${BUNDLE_FORMAT}.`
  }
  return null
}
