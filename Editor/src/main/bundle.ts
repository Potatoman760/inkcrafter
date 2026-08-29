import { createHash } from 'node:crypto'
import { copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import {
  assetKey,
  BUNDLE_FILES,
  BUNDLE_FORMAT,
  BUNDLE_MEDIA_DIR,
  DEFAULT_STAGE,
  isGameId,
  type BundleAsset,
  type BundleManifest
} from '@shared/bundle/manifest'
import type { BundleExportResult } from '@shared/bundle/result'
import {
  PREVIEW_CHECKPOINT_FORMAT,
  serialisePreviewCheckpoint,
  type PreviewCheckpoint
} from '@shared/bundle/preview'
import { scanKnots } from '@shared/inkKnots'
import { preflight } from '@shared/bundle/preflight'
import { emptyGame, parseGame, serialiseGame, type GameDocument } from '@shared/bundle/gameDoc'
import { emptyNpcs, parseNpcs, serialiseNpcs, type NpcDocument } from '@shared/bundle/npcDoc'
import { emptyMap, parseMap, serialiseMap, type MapDocument } from '@shared/bundle/mapDoc'
import {
  emptyGallery,
  parseGallery,
  serialiseGallery,
  type GalleryDocument
} from '@shared/bundle/galleryDoc'
import {
  emptyAchievements,
  parseAchievements,
  serialiseAchievements,
  type AchievementDocument
} from '@shared/bundle/achievementDoc'
import {
  emptyMinigames,
  parseMinigames,
  serialiseMinigames,
  type MinigameDocument
} from '@shared/bundle/minigameDoc'
import {
  emptyMedia,
  isAudioFile,
  isVideoFile,
  MEDIA_DIR,
  parseMedia,
  serialiseBundleMedia,
  type MediaAsset,
  type MediaDocument,
  type MediaVariant
} from '@shared/mediaDoc'
import { TAG_PREFIX } from '@shared/mediaTag'
import { emptyStats, parseStats, type StatsDocument } from '@shared/statsDoc'
import { buildExport, serialiseExport } from '@shared/statsExport'
import type { Project } from '@shared/project'
import type { InkDiagnostic } from '@shared/types'
import { imageSize } from './imageSize'
import { compileStory } from './ink/compiler'
import { stripBom } from './text'
import { protectStagingBundle } from './bundleProtection'
import type { ProjectProtection } from '@shared/project'

/**
 * Exporting a project as a bundle.
 *
 * The one place the app stops being an editor and becomes a build step. Three
 * things happen here that could not happen in a player: `INCLUDE`s are resolved
 * against the project directory, the story is compiled where a compiler and a
 * filesystem both exist, and a story that does not compile is *refused* rather
 * than shipped. A player fetching a bundle can assume it is whole.
 *
 * Compiled with `countAllVisits`, always. A game asking "has the reader been to
 * this knot yet" — to unlock a location, to vary a greeting — is the ordinary
 * case for a visual novel, and the flag is baked into the emitted JSON as a
 * per-container `visitsShouldBeCounted`, so a bundle exported without it could
 * never answer, no matter what the player did.
 */
export interface BundleExportOptions {
  /** Emit a transient checkpoint for the connected player. Omitted for normal exports. */
  preview?: { id: string; target: string | null }
  /** Development and diagnostics may deliberately bypass a project's release setting. */
  forcePlain?: boolean
}

export async function exportBundle(
  project: Project,
  outDir: string,
  options: BundleExportOptions = {}
): Promise<BundleExportResult> {
  const warnings: string[] = []

  const entry = join(project.path, project.main.split('/').join(sep))
  const { story, diagnostics, filesRead } = compileStory(
    { filePath: entry },
    { countAllVisits: true }
  )

  if (story === null || diagnostics.some((d) => d.severity === 'error')) {
    return { ok: false, outDir, manifest: null, diagnostics, warnings }
  }

  const refusal = await refuseDestination(outDir)
  if (refusal !== null) {
    return { ok: false, outDir, manifest: null, diagnostics, warnings: [...warnings, refusal] }
  }

  // ToJson() is typed `string | void` because it can write into a supplied
  // writer instead; with no writer it always returns the string.
  const storyJson = story.ToJson() as string
  const contentHash = createHash('sha256').update(storyJson, 'utf8').digest('hex')
  let preview: PreviewCheckpoint | null = null

  if (options.preview) {
    try {
      if (options.preview.target !== null) {
        // Resetting the callstack makes this the same kind of arrival as map
        // travel. Do not Continue: the player must still process the first
        // paragraph's media, state and autosave tags itself.
        story.ChoosePathString(options.preview.target, true)
      }
      preview = {
        format: PREVIEW_CHECKPOINT_FORMAT,
        id: options.preview.id,
        bundleId: project.id,
        contentHash,
        target: options.preview.target,
        inkState: story.state.ToJson()
      }
    } catch {
      const target = options.preview.target ?? 'the story beginning'
      return {
        ok: false,
        outDir,
        manifest: null,
        diagnostics,
        warnings: [...warnings, `Cannot preview ${target} because it is not reachable in this compile.`]
      }
    }
  }

  const [stats, media, npcs, map, gallery, achievements, minigames, game] = await Promise.all([
    readDoc(project, 'stats.json', parseStats, emptyStats),
    readDoc(project, 'media.json', parseMedia, emptyMedia),
    readDoc(project, 'npcs.json', parseNpcs, emptyNpcs),
    readDoc(project, 'map.json', parseMap, emptyMap),
    readDoc(project, 'gallery.json', parseGallery, emptyGallery),
    readDoc(project, 'achievements.json', parseAchievements, emptyAchievements),
    readDoc(project, 'minigames.json', parseMinigames, emptyMinigames),
    readDoc(project, 'game.json', parseGame, emptyGame)
  ])

  // Built beside the destination and swapped in at the end, so a crash or a
  // full disk cannot leave a half-written bundle where a player would find one,
  // and a dev server watching the folder never serves a story.json from this
  // export beside a media.json from the last.
  const staging = join(dirname(outDir), `.${basename(outDir)}.inkcrafter-tmp`)
  await rm(staging, { recursive: true, force: true })
  await mkdir(join(staging, BUNDLE_MEDIA_DIR), { recursive: true })

  try {
    return await writeBundle(
      project,
      outDir,
      staging,
      {
        storyJson,
        contentHash,
        preview,
        stats,
        media,
        npcs,
        map,
        gallery,
        achievements,
        minigames,
        game,
        protection: options.preview || options.forcePlain ? null : (project.protection ?? null)
      },
      { diagnostics, warnings, filesRead }
    )
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

interface BundleContents {
  storyJson: string
  contentHash: string
  preview: PreviewCheckpoint | null
  stats: StatsDocument
  media: MediaDocument
  npcs: NpcDocument
  map: MapDocument
  gallery: GalleryDocument
  achievements: AchievementDocument
  minigames: MinigameDocument
  game: GameDocument
  protection: ProjectProtection | null
}

interface ExportContext {
  diagnostics: InkDiagnostic[]
  warnings: string[]
  filesRead: string[]
}

async function writeBundle(
  project: Project,
  outDir: string,
  staging: string,
  contents: BundleContents,
  context: ExportContext
): Promise<BundleExportResult> {
  const {
    storyJson, contentHash, preview, stats, media, npcs, map, gallery, achievements, minigames, game, protection
  } = contents
  const { diagnostics, warnings, filesRead } = context

  const folder = basename(outDir)
  if (!isGameId(folder)) {
    warnings.push(
      `A player names a game by its folder, and "${folder}" is not a name one can ask for ` +
        '(letters, digits, dot, dash and underscore, not starting with a separator). The bundle ' +
        'is complete; rename the folder to load it.'
    )
  }

  const assets = await copyMedia(project, staging, media.assets, warnings)
  const sources = await readSources(project, filesRead)
  const knots = destinationsIn(sources)

  // Reported rather than refused. A story with one misspelled sprite is still a
  // story worth playing, and half of what this finds is work in progress.
  // Measured only for the art the map draws: the rule is that one hotspot's
  // looks are all one size, and reading every sprite in the project to check
  // something nobody asserted about them would be work for nothing.
  const sizes = await measureHotspots(project, media)

  for (const problem of preflight({ sources, media, stats, npcs, map, gallery, minigames, game, knots, sizes })) {
    const at = problem.line === null ? '' : `:${problem.line}`
    const where = problem.file === null ? '' : `${problem.file}${at} — `
    warnings.push(`${where}${problem.message}`)
  }

  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT,
    generatedBy: 'InkCrafter',
    generatedAt: new Date().toISOString(),
    project: { id: project.id, title: project.title },
    contentHash,
    knots,
    assets,
    stage: { ...DEFAULT_STAGE }
  }

  const writes = [
    writeFile(join(staging, BUNDLE_FILES.story), storyJson, 'utf8'),
    // Regenerated from `stats.json` rather than copied from `export/`, so an
    // export can never ship a catalogue older than the story beside it.
    writeFile(join(staging, BUNDLE_FILES.catalogue), serialiseExport(buildExport(stats)), 'utf8'),
    // The authored catalogue stores a music track as one `file`; the player
    // still consumes the compatibility variant produced at parse time.
    writeFile(join(staging, BUNDLE_FILES.media), serialiseBundleMedia(media), 'utf8'),
    writeFile(join(staging, BUNDLE_FILES.npcs), serialiseNpcs(npcs), 'utf8'),
    writeFile(join(staging, BUNDLE_FILES.map), serialiseMap(map), 'utf8'),
    writeFile(join(staging, BUNDLE_FILES.gallery), serialiseGallery(gallery), 'utf8'),
    writeFile(
      join(staging, BUNDLE_FILES.achievements),
      serialiseAchievements(achievements),
      'utf8'
    ),
    writeFile(join(staging, BUNDLE_FILES.minigames), serialiseMinigames(minigames), 'utf8'),
    writeFile(join(staging, BUNDLE_FILES.game), serialiseGame(game), 'utf8'),
    writeFile(join(staging, BUNDLE_FILES.manifest), serialiseJson(manifest), 'utf8')
  ]
  if (preview) {
    writes.push(
      writeFile(
        join(staging, BUNDLE_FILES.preview),
        serialisePreviewCheckpoint(preview),
        'utf8'
      )
    )
  }
  await Promise.all(writes)

  if (protection) await protectStagingBundle(staging, protection, manifest)

  await swapIn(staging, outDir, warnings)

  return { ok: true, outDir, manifest, diagnostics, warnings }
}

/**
 * Puts the new bundle where the old one was.
 *
 * Renaming a finished folder into place is the right way to do this: the
 * destination is either the old bundle or the new one, never half of each, so a
 * dev server watching the folder cannot serve this export's `story.json` beside
 * the last one's `media.json`.
 *
 * It also does not work on Windows whenever anything has the folder open — an
 * editor with the project loaded is enough — and `rename` fails with EPERM.
 * Worse, the first version deleted the destination *before* renaming, so a
 * failure took the whole bundle with it. That is how the player's game folder
 * ended up empty.
 *
 * So: rename when it works, and when Windows will not allow it, update the
 * files in place instead. The fallback is not atomic and says so, because a
 * bundle that cannot be exported at all is worse than one a watcher might
 * glimpse mid-update. Either way the old bundle is only removed once the new
 * one is somewhere safe.
 *
 * *Every* rename here needs that treatment, including the one into a
 * destination that does not exist yet. A first export can fail EPERM too — the
 * files were written a moment ago, and on Windows an indexer or a scanner
 * holding one of them for a few hundred milliseconds is enough. That branch
 * had no fallback, so the first preview into a fresh folder threw.
 */
export async function swapIn(
  staging: string,
  outDir: string,
  warnings: string[] = []
): Promise<void> {
  if (!(await exists(outDir))) {
    try {
      await renamePatiently(staging, outDir)
    } catch (error) {
      if (!isHeld(error)) throw error
      await mirror(staging, outDir)
      await rm(staging, { recursive: true, force: true })
      warnings.push(held(outDir))
    }
    return
  }

  const aside = join(dirname(outDir), `.${basename(outDir)}.inkcrafter-old`)
  await rm(aside, { recursive: true, force: true })

  try {
    await renamePatiently(outDir, aside)
  } catch (error) {
    if (!isHeld(error)) throw error
    await mirror(staging, outDir)
    await rm(staging, { recursive: true, force: true })
    warnings.push(held(outDir))
    return
  }

  try {
    await renamePatiently(staging, outDir)
  } catch (error) {
    // Put back what was there before deciding what to do about it.
    await rename(aside, outDir)
    if (!isHeld(error)) throw error
    await mirror(staging, outDir)
    await rm(staging, { recursive: true, force: true })
    warnings.push(held(outDir))
    return
  }

  await rm(aside, { recursive: true, force: true })
}

const held = (outDir: string): string =>
  `${outDir} could not be replaced in one step — something has it open, which on Windows is ` +
  'usually an editor or a dev server. Its files were updated in place instead, so a watcher ' +
  'may have seen the bundle mid-update. Reload the player if it looks wrong.'

/** Whether the platform refused the move because someone is holding the folder. */
/**
 * `rename`, retried briefly while something is holding the folder.
 *
 * A lock taken by an indexer or a scanner is measured in milliseconds and lets
 * go on its own; falling straight through to the in-place mirror would give up
 * on the atomic swap over something that would have cleared before an author
 * noticed. Three quick attempts, then the caller's fallback.
 */
async function renamePatiently(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      if (attempt >= 2 || !isHeld(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }
}

function isHeld(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY' || code === 'ENOTEMPTY'
}

/**
 * Makes `to` hold exactly what `from` holds, file by file.
 *
 * Stale files are removed first so that a sprite dropped from the catalogue is
 * gone before the new manifest arrives claiming it is not there — the reverse
 * order would leave a window where the manifest and the folder disagree in the
 * direction a player notices.
 */
export async function mirror(from: string, to: string): Promise<void> {
  const wanted = await filesUnder(from)

  for (const path of await filesUnder(to)) {
    if (!wanted.has(path)) await rm(join(to, path.split('/').join(sep)), { force: true })
  }

  await cp(from, to, { recursive: true, force: true })
}

/** Every file under a directory, as forward-slashed relative paths. */
async function filesUnder(dir: string, prefix = ''): Promise<Set<string>> {
  const found = new Set<string>()

  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return found
  }

  for (const entry of entries) {
    const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      for (const nested of await filesUnder(join(dir, entry.name), path)) found.add(nested)
    } else {
      found.add(path)
    }
  }

  return found
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function serialiseJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * Why this folder must not be exported into, or null when it may be.
 *
 * An export replaces the destination wholesale — a bundle is a snapshot, and a
 * sprite left behind by an earlier export is a file the player would happily
 * load. That is only a safe thing to do to a folder that is already a bundle,
 * or is empty. The destination comes from a native folder picker, so "somewhere
 * with a year of work in it" is one misclick away, and there is no undo.
 */
async function refuseDestination(outDir: string): Promise<string | null> {
  let contents: string[]
  try {
    contents = await readdir(outDir)
  } catch (error) {
    // Nothing there yet is the normal case for a first export.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  if (contents.length === 0 || contents.includes(BUNDLE_FILES.manifest)) return null

  // The likeliest wrong answer, and the one with the worst symptom: a player
  // serves a folder *of* games and finds each by name, so a bundle written into
  // that folder rather than into one inside it is served at the wrong depth and
  // simply never loads. "Choose an empty folder" would be bad advice here.
  const games = await bundlesInside(outDir, contents)
  if (games.length > 0) {
    return (
      `${outDir} holds games (${games.join(', ')}) rather than being one. A bundle goes in ` +
      `its own folder inside it — ${join(outDir, '<name>')} — which is the name a player ` +
      'asks for. Nothing was written.'
    )
  }

  return (
    `${outDir} is not empty and is not a bundle. Exporting would replace everything ` +
    'in it, so nothing was written. Choose an empty folder.'
  )
}

/** Which of a folder's children are themselves bundles. */
async function bundlesInside(outDir: string, contents: string[]): Promise<string[]> {
  const found: string[] = []

  for (const name of contents) {
    try {
      if (!(await stat(join(outDir, name))).isDirectory()) continue
      if ((await readdir(join(outDir, name))).includes(BUNDLE_FILES.manifest)) found.push(name)
    } catch {
      continue
    }
  }

  return found
}

/**
 * Every ink file the compile read, by project-relative path.
 *
 * Read once and passed around, because both the knot scan and the tag preflight
 * want the same text and re-reading it per pass would be the sort of waste that
 * only shows up on a project with two hundred chapters.
 */
export async function readSources(project: Project, filesRead: string[]): Promise<Map<string, string>> {
  const sources = new Map<string, string>()

  for (const file of filesRead) {
    try {
      const inside = relative(project.path, file).split(sep).join('/')
      sources.set(inside, stripBom(await readFile(file, 'utf8')))
    } catch {
      // A file the compiler read but we cannot is not worth failing over; the
      // compile already succeeded, so it was there a moment ago.
      continue
    }
  }

  return sources
}

/**
 * Every place the story can be told to go.
 *
 * Read from the source rather than from the compiled story: the runtime holds
 * containers addressed by path, but which of them an author would call a knot
 * is a fact about the text, and `scanKnots` already answers it — functions
 * excluded, because a function is called rather than travelled to.
 */
export function destinationsIn(sources: Map<string, string>): string[] {
  const names = new Set<string>()

  for (const source of sources.values()) {
    for (const knot of scanKnots(source)) {
      if (!knot.isFunction) names.add(knot.name)
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b))
}

/**
 * Copies every catalogued file into the bundle and describes it.
 *
 * Driven by the catalogue rather than by what is on disk: an image nobody
 * catalogued cannot be named by a tag, so shipping it would only make the
 * download bigger. The reverse — a catalogued look whose file has gone — is
 * worth saying out loud, because the story will ask for it and get nothing.
 */
/**
 * The pixel size of every hotspot look, by its path under `media/`.
 *
 * Read here because this is where a disk exists — `preflight` is pure so it can
 * be run against a document in a test, so it is handed the answer rather than
 * finding it.
 */
export async function measureHotspots(
  project: Project,
  media: MediaDocument
): Promise<Record<string, { width: number; height: number }>> {
  const sizes: Record<string, { width: number; height: number }> = {}

  for (const asset of media.assets) {
    if (asset.kind !== 'hotspot') continue

    for (const variant of asset.variants) {
      if (variant.file.length === 0 || sizes[variant.file]) continue
      const found = await imageSize(join(project.path, MEDIA_DIR, variant.file.split('/').join(sep)))
      if (found) sizes[variant.file] = found
    }
  }

  return sizes
}

async function copyMedia(
  project: Project,
  staging: string,
  assets: MediaAsset[],
  warnings: string[]
): Promise<BundleAsset[]> {
  const copied: BundleAsset[] = []
  const seen = new Set<string>()

  for (const asset of assets) {
    for (const variant of asset.variants) {
      // A kind with no tag keys on the kind itself: nothing in the story asks
      // for a hotspot by tag, but the bundle still has to name the file.
      const key = assetKey(TAG_PREFIX[asset.kind] ?? asset.kind, asset.name, variant.name)
      if (seen.has(key)) {
        warnings.push(`Two looks resolve to the same key ${key}; only the first is exported.`)
        continue
      }

      const bytes = await copyVariant(project, staging, variant, warnings)
      if (bytes === null) continue

      seen.add(key)
      copied.push({
        path: `${BUNDLE_MEDIA_DIR}/${variant.file}`,
        // Read from the file, not from the kind of asset it belongs to. The two
        // disagree: a background may be a looping clip, and one shipped as an
        // `image` is a broken picture in a player that believed the manifest.
        kind: isVideoFile(variant.file) ? 'video' : isAudioFile(variant.file) ? 'audio' : 'image',
        key,
        bytes
      })
    }
  }

  return copied
}

async function copyVariant(
  project: Project,
  staging: string,
  variant: MediaVariant,
  warnings: string[]
): Promise<number | null> {
  const from = join(project.path, MEDIA_DIR, variant.file.split('/').join(sep))
  const to = join(staging, BUNDLE_MEDIA_DIR, variant.file.split('/').join(sep))

  try {
    const info = await stat(from)
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
    return info.size
  } catch {
    warnings.push(`${variant.file} is in the catalogue but not in media/. Nothing was copied.`)
    return null
  }
}

/**
 * A project's catalogue, or an empty one.
 *
 * Read here rather than through `stats.ts`/`media.ts` so that exporting depends
 * on nothing but the filesystem — those modules reach the `app://` protocol and
 * so the Electron app object, and an exporter that could not run outside
 * Electron could not be tested, scripted, or run from a watch task.
 */
export async function readDoc<T>(
  project: Project,
  file: string,
  parse: (json: string) => T,
  fallback: () => T
): Promise<T> {
  try {
    return parse(stripBom(await readFile(join(project.path, file), 'utf8')))
  } catch {
    return fallback()
  }
}

/** Reads a manifest back, for telling the author what is already in a folder. */
export async function readManifest(outDir: string): Promise<BundleManifest | null> {
  try {
    return JSON.parse(await readFile(join(outDir, BUNDLE_FILES.manifest), 'utf8')) as BundleManifest
  } catch {
    return null
  }
}
