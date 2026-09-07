import { readFile, stat, unlink } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import {
  claimedFiles,
  emptyMedia,
  MEDIA_DIR,
  parseMedia,
  serialiseMedia,
  type MediaDocument
} from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import type { MediaFile } from '@shared/types'
import { pruneEmptyFolders, walkFiles } from './fs'
import { isServableMedia, mediaUrl } from './mediaProtocol'
import { stripBom } from './text'
import { dataDir } from './workspace'
import { writeWatched } from './watch'

/**
 * The media catalogue lives at `media.json` in the project, beside `plan.json`
 * and `stats.json`, and the images it describes live under `media/`.
 *
 * Nothing is generated from it. Stats and items become declarations the story
 * cannot run without; media reach the story as tags the author writes, so this
 * side only reads and writes the catalogue itself.
 */
const MEDIA_FILE = 'media.json'

export async function readMedia(project: Project): Promise<MediaDocument> {
  try {
    return parseMedia(stripBom(await readFile(join(project.path, MEDIA_FILE), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return emptyMedia()
  }
}

export async function writeMedia(project: Project, doc: MediaDocument): Promise<void> {
  await writeWatched(join(project.path, MEDIA_FILE), serialiseMedia(doc))
}

/**
 * Every image under the project's `media/`, as paths relative to that folder.
 *
 * Scanned rather than imported. The author adds files with whatever they already
 * use — Explorer, a drawing tool's export dialog, a sync folder — and the app
 * lists what it finds, which is the same bargain the codex strikes by leaving
 * deletion to the file manager. Making the app the only way in would be a poor
 * trade for binary assets nobody wants to hand over one at a time.
 *
 * A missing `media/` is an empty list rather than an error: it is the normal
 * state of a project that has not got there yet.
 */
export async function scanMedia(project: Project): Promise<MediaFile[]> {
  const root = join(project.path, MEDIA_DIR)
  const found = await walkFiles(root, isServableMedia)

  const files = await Promise.all(
    found.map(async (path): Promise<MediaFile> => {
      const absolute = join(root, path.split('/').join(sep))
      const bytes = await stat(absolute).then(
        (info) => info.size,
        () => 0
      )

      return { path, bytes, url: mediaUrl(workspacePathOf(project, path)) }
    })
  )

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Permanently removes an unclaimed media file.
 *
 * The renderer only offers this beside its "Not filed yet" tiles, but main
 * enforces that boundary too: a stale renderer must never erase a file still
 * named by the catalogue. Matching against a fresh scan also turns the
 * renderer's relative path into one the filesystem itself just produced,
 * rather than trusting an arbitrary path crossing IPC.
 */
export async function deleteMediaFile(project: Project, file: string): Promise<void> {
  if (claimedFiles(await readMedia(project)).has(file)) {
    throw new Error(`Cannot delete ${file}: it is still used by the media catalogue.`)
  }

  const root = join(project.path, MEDIA_DIR)
  const exists = (await walkFiles(root, isServableMedia)).includes(file)
  if (!exists) throw new Error(`Cannot delete ${file}: the file was not found.`)

  const absolute = join(root, file.split('/').join(sep))
  await unlink(absolute)
  await pruneEmptyFolders(root, dirname(absolute))
}

/**
 * A media file's path relative to the *workspace*, which is what the `app://`
 * scheme serves from — the catalogue stores paths relative to the project's
 * `media/`, and the two are not the same thing.
 */
export function workspacePathOf(project: Project, file: string): string {
  const absolute = join(project.path, MEDIA_DIR, file.split('/').join(sep))
  return relative(dataDir(), absolute).split(sep).join('/')
}

/** The URL the renderer should point an `<img>` at for a catalogued file. */
export function urlForMedia(project: Project, file: string): string {
  return mediaUrl(workspacePathOf(project, file))
}
