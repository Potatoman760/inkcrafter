import { watch, type FSWatcher } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { relative, sep } from 'node:path'
import type { Project } from '@shared/project'
import type { WorkspaceChange } from '@shared/types'

/**
 * Watching the open project for changes the app did not make.
 *
 * A project is a folder of ordinary files, and this app is not the only thing
 * that edits them: an author keeps an ink file open in another editor, a script
 * rewrites `minigames.json`, `git checkout` moves the lot. Without this, the
 * editor holds a stale copy and eventually writes it back over the change.
 *
 * The hard part is not noticing — it is telling somebody else's write from our
 * own. Every save this app makes lands in the same folder and fires the same
 * event, so a watcher that reported everything would tell the renderer to
 * reload the thing it just wrote, mid-keystroke. `writeWatched` is the answer:
 * main writes through it, the path is remembered for a moment, and the echo is
 * dropped. Anything not written that way is somebody else.
 */

/** Long enough for the event to arrive after the write that caused it. */
const ECHO_MS = 1500

/** Quiet time before reporting, so a burst of writes is one change. */
const SETTLE_MS = 120

/** Where a project keeps the catalogues, all at its top level. */
const CATALOGUES = new Set([
  'project.md',
  'plan.json',
  'stats.json',
  'npcs.json',
  'media.json',
  'map.json',
  'gallery.json',
  'achievements.json',
  'game.json',
  'minigames.json'
])

/**
 * What is not worth reporting: directories, and half-written files.
 *
 * Windows names the containing folder as well as the file inside it, and a
 * folder with no extension is how that arrives — so a saved file would
 * otherwise be reported twice, once as itself and once as the folder it sits
 * in, and the second one carries no name the renderer can act on. Nothing is
 * lost by dropping it: whatever changed inside reports itself.
 *
 * An editor saving over a file often writes a temporary beside it first. Those
 * are not the author's work either.
 */
function ignored(path: string): boolean {
  const name = path.split('/').pop() ?? ''
  return (
    !name.includes('.') ||
    name.startsWith('.') ||
    name.startsWith('~') ||
    name.endsWith('~') ||
    name.endsWith('.tmp') ||
    name.endsWith('.swp')
  )
}

/** Written by us, and until when the echo of it should be ignored. */
const ours = new Map<string, number>()

/** Records a write so the watcher does not report it back as somebody else's. */
export function noteWrite(absolutePath: string): void {
  const now = Date.now()
  ours.set(absolutePath, now + ECHO_MS)
  // Swept here rather than on a timer: the map is small, and a timer would keep
  // the process awake for nothing.
  for (const [path, until] of ours) if (until < now) ours.delete(path)
}

/** Writes a file the way main should: recorded, so the watcher stays quiet about it. */
export async function writeWatched(absolutePath: string, contents: string): Promise<void> {
  noteWrite(absolutePath)
  await writeFile(absolutePath, contents, 'utf8')
  // Again afterwards: a slow write can land well after the call began, and the
  // window has to cover when the event actually fires.
  noteWrite(absolutePath)
}

function isEcho(absolutePath: string): boolean {
  const until = ours.get(absolutePath)
  return until !== undefined && until >= Date.now()
}

export interface ProjectWatcher {
  close: () => void
}

/**
 * Reports what changed under a project, as project-relative paths.
 *
 * One recursive watch rather than one per file: the set of files is itself
 * something that changes, and a per-file watch could not see a new one arrive.
 * Node gives no promise about how many events a single save produces, so they
 * are collected until the folder goes quiet and reported once.
 */
export function watchProject(
  project: Project,
  onChange: (change: WorkspaceChange) => void
): ProjectWatcher {
  const changed = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let watcher: FSWatcher | null = null

  const report = (): void => {
    timer = null
    const paths = [...changed]
    changed.clear()
    if (paths.length === 0) return

    onChange({
      ink: paths.filter((path) => path.endsWith('.ink')),
      catalogues: paths.filter((path) => CATALOGUES.has(path)),
      other: paths.filter((path) => !path.endsWith('.ink') && !CATALOGUES.has(path))
    })
  }

  try {
    watcher = watch(project.path, { recursive: true }, (_event, name) => {
      if (!name) return
      const path = name.toString().split(sep).join('/')
      if (ignored(path)) return
      if (isEcho(`${project.path}${sep}${name.toString()}`)) return

      changed.add(path)
      if (timer) clearTimeout(timer)
      timer = setTimeout(report, SETTLE_MS)
    })
  } catch {
    // A project on a filesystem that cannot be watched is still a project worth
    // editing. Nothing reloads by itself, which is where this app already was.
    watcher = null
  }

  return {
    close: () => {
      if (timer) clearTimeout(timer)
      timer = null
      watcher?.close()
      watcher = null
    }
  }
}

/** The project-relative name of a path, or null for one outside it. */
export function inProject(project: Project, absolutePath: string): string | null {
  const inside = relative(project.path, absolutePath)
  return inside && !inside.startsWith('..') ? inside.split(sep).join('/') : null
}
