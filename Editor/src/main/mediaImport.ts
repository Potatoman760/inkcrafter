import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { assetFolder, lookFile, MEDIA_DIR, type MediaKind } from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import type { ImportLookRequest, ImportLookResult } from '@shared/types'
import { exists, pruneEmptyFolders } from './fs'
import { isServableMedia } from './mediaProtocol'

/**
 * Bringing a picture into a project.
 *
 * Until now the only way in was to open `media/` and drop a file there, which
 * is fine for a folder of art prepared in advance and poor for the ordinary
 * case: one sprite, for the character on screen, now.
 *
 * Two things happen, and the second is the reason this is not three lines. The
 * chosen file is copied in under the name the look will be known by — and that
 * asset's other looks are gathered in beside it, because half a character's
 * expressions in `sprites/` and half in `characters/kael/` is worse than
 * either arrangement on its own. The catalogue is not touched here: the moves
 * are reported back and the renderer, which holds the document, follows them.
 */

/** Everything under `media/`, as an absolute path. */
function mediaRoot(project: Project): string {
  return join(project.path, MEDIA_DIR)
}

function absolute(project: Project, file: string): string {
  return join(mediaRoot(project), ...file.split('/'))
}

/**
 * A name nothing has taken, so writing into `media/` never destroys what is
 * there. `wanted` is relative to `media/`, and so is the answer.
 *
 * Exported because `mediaCutout.ts` needs exactly this and a second copy of it
 * would be the third — `ai/imageTools.ts` has its own, rooted differently — and
 * three is where a rule stops being a rule.
 */
export async function freeFile(project: Project, wanted: string): Promise<string> {
  const dot = wanted.lastIndexOf('.')
  const stem = dot === -1 ? wanted : wanted.slice(0, dot)
  const extension = dot === -1 ? '' : wanted.slice(dot)

  for (let attempt = 1; attempt < 100; attempt++) {
    const candidate = attempt === 1 ? wanted : `${stem}-${attempt}${extension}`
    if (!(await exists(absolute(project, candidate)))) return candidate
  }

  return `${stem}-${Date.now()}${extension}`
}

/**
 * Moves a file inside `media/`, falling back to a copy.
 *
 * `rename` is the right call and fails across volumes, which a media folder on
 * another drive would be. The fallback is not an optimisation.
 */
async function moveWithin(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch {
    await copyFile(from, to)
    await rm(from, { force: true })
  }
}

/**
 * Copies a chosen file in as one look, gathering the asset's others with it.
 *
 * `chosen` is an absolute path from the file dialog — the one thing here that
 * comes from outside the workspace. Its name is not used: the file is written
 * under the look's name, in the asset's own folder, both of which the app
 * decides.
 */
export async function importLook(
  project: Project,
  request: ImportLookRequest,
  chosen: string
): Promise<ImportLookResult> {
  const nothing = { ok: false, cancelled: false, file: null, moved: [], message: '' }

  if (!isServableMedia(chosen)) {
    return { ...nothing, message: 'That is not a picture, a clip or a track the app can play.' }
  }

  let bytes: number
  try {
    bytes = (await stat(chosen)).size
  } catch {
    return { ...nothing, message: `Could not read ${chosen}.` }
  }
  if (bytes === 0) return { ...nothing, message: 'That file is empty.' }

  const folder = assetFolder(request.kind as MediaKind, request.asset)
  const wanted = lookFile(request.kind as MediaKind, request.asset, request.look, chosen)

  // Gathered first, so the new look is named against what will be there rather
  // than against a folder about to change underneath it.
  const moved = await gather(project, folder, request.gather)

  const file = await freeFile(project, wanted)
  const destination = absolute(project, file)

  try {
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(chosen, destination)
  } catch (cause) {
    return {
      ...nothing,
      moved,
      message: `Could not copy it in: ${cause instanceof Error ? cause.message : String(cause)}`
    }
  }

  return { ok: true, cancelled: false, file, moved, message: '' }
}

/**
 * Brings an asset's existing looks into its folder.
 *
 * Only files that are somewhere else, and only ever within `media/`. A look
 * already in the right place is left exactly alone, which is what makes this
 * safe to run on every import rather than once.
 */
async function gather(
  project: Project,
  folder: string,
  files: string[]
): Promise<{ from: string; to: string }[]> {
  const moved: { from: string; to: string }[] = []
  const emptied = new Set<string>()

  for (const from of files) {
    if (from.length === 0 || from.startsWith(`${folder}/`)) continue

    const source = absolute(project, from)
    if (!(await exists(source))) continue

    // Keep the file's own name on the way across: it is the author's, and the
    // look it belongs to is already recorded in the catalogue.
    const leaf = from.split('/').pop()!
    const to = await freeFile(project, `${folder}/${leaf}`)

    try {
      await moveWithin(source, absolute(project, to))
      moved.push({ from, to })
      emptied.add(dirname(source))
    } catch {
      // A file that will not move is not a reason to abandon the import; the
      // catalogue still points at where it is.
      continue
    }
  }

  // The folder a file came out of may now hold nothing. Left behind, `sprites/`
  // sits there empty implying art that is no longer in it.
  for (const directory of emptied) {
    await pruneEmptyFolders(mediaRoot(project), directory).catch(() => {})
  }

  return moved
}

/** Extensions the file dialog offers, from what the app can actually show. */
export const IMPORTABLE = [
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg',
  'mp4', 'webm',
  'mp3', 'ogg', 'wav', 'm4a', 'flac', 'opus'
]

