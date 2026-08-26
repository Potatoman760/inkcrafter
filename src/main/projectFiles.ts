import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import type { Project } from '@shared/project'
import {
  includesIn,
  relativeInclude,
  rewriteIncludes,
  type InkReference
} from '@shared/inkRefs'
import { exists, isDirectory, pruneEmptyFolders, safePath, walkFiles } from './fs'
import { listInkFiles, saveProject } from './project'
import { readPlan } from './plan'
import { parsePlan, serialisePlan } from '@shared/planDoc'
import { stripBom } from './text'

/**
 * Renaming, moving and deleting the ink a project is written in.
 *
 * The file is the easy half. Three things name an ink file by its path — the
 * `INCLUDE` lines in other ink files, the entry point in `project.md`, and the
 * files a plan section is attached to — and a move that leaves them behind
 * produces a story that no longer compiles and no clue as to why.
 *
 * So every operation here walks those three first. A rename follows them; a
 * delete reports them and lets the author decide. Nothing is written until the
 * whole set is known, because a half-followed rename is worse than none.
 */

function toDisk(project: Project, path: string): string {
  return join(project.path, path.split('/').join(sep))
}

/**
 * Every folder under the project that could hold ink.
 *
 * Listed separately from the files because a folder with nothing in it cannot
 * be inferred from a list of paths — and an empty folder is exactly what you
 * have in the moment between making one and putting something in it.
 */
export async function listInkFolders(project: Project): Promise<string[]> {
  const found = new Set<string>()

  async function walk(prefix: string): Promise<void> {
    let contents
    try {
      contents = await readdir(join(project.path, prefix.split('/').join(sep)), {
        withFileTypes: true
      })
    } catch {
      return
    }

    for (const item of contents) {
      if (!item.isDirectory()) continue
      // Not the author's: media is a catalogue, and export is generated.
      if (prefix === '' && (item.name === 'media' || item.name === 'export')) continue
      if (item.name.startsWith('.')) continue

      const child = prefix ? `${prefix}/${item.name}` : item.name
      found.add(child)
      await walk(child)
    }
  }

  await walk('')
  return [...found].sort((a, b) => a.localeCompare(b))
}

export async function addFolder(project: Project, path: string): Promise<string> {
  const absolute = safePath(project.path, path, '')
  if (await exists(absolute)) throw new Error(`"${path}" already exists`)

  await mkdir(absolute, { recursive: true })
  return path
}

/**
 * Everything pointing at a file, or at anything inside a folder.
 *
 * The same walk answers both questions a caller has: what a rename must
 * rewrite, and what a delete is about to break.
 */
export async function referencesTo(project: Project, path: string): Promise<InkReference[]> {
  const targets = new Set<string>()
  if (await isDirectory(toDisk(project, path))) {
    const inside = await walkFiles(toDisk(project, path), (name) =>
      name.toLowerCase().endsWith('.ink')
    )
    for (const child of inside) targets.add(`${path}/${child}`)
  } else {
    targets.add(path)
  }

  const references: InkReference[] = []

  for (const file of await listInkFiles(project)) {
    // A file's own includes go with it, and are not a reason to refuse.
    if (targets.has(file.path)) continue

    let source: string
    try {
      source = stripBom(await readFile(file.absolutePath, 'utf8'))
    } catch {
      continue
    }

    for (const include of includesIn(file.path, source)) {
      if (!targets.has(include.target)) continue
      references.push({
        kind: 'include',
        file: file.path,
        line: include.line + 1,
        detail: `INCLUDE ${include.written}`
      })
    }
  }

  if (targets.has(project.main)) {
    references.push({ kind: 'entry', detail: `${project.main} is the story's entry point` })
  }

  const plan = await readPlan(project)
  const walkPlan = (nodes: Awaited<ReturnType<typeof readPlan>>['nodes']): void => {
    for (const node of nodes) {
      for (const file of node.files) {
        if (targets.has(file)) {
          references.push({ kind: 'plan', detail: `${file} is attached to "${node.title}"` })
        }
      }
      walkPlan(node.children)
    }
  }
  walkPlan(plan.nodes)

  for (const file of plan.globals) {
    if (targets.has(file)) {
      references.push({ kind: 'plan', detail: `${file} is marked as global ink` })
    }
  }

  return references
}

export interface MoveResult {
  path: string
  /** Files whose INCLUDE lines were rewritten, for the toast. */
  written: string[]
}

/**
 * Renames or moves one ink file, and follows everything that named it.
 *
 * `from` and `to` are project-relative and include the extension, because a
 * rename is allowed to change the folder as well as the name — dragging a file
 * into a folder is the same operation.
 */
export async function moveInkFile(
  project: Project,
  from: string,
  to: string
): Promise<MoveResult> {
  if (from === to) return { path: to, written: [] }

  const source = toDisk(project, from)
  const target = safePath(project.path, to.replace(/\.ink$/i, ''), '.ink')

  // rename replaces an existing destination on both Windows and POSIX, which
  // would silently destroy whatever is already there.
  if (await exists(target)) throw new Error(`"${to}" already exists`)
  if (!(await exists(source))) throw new Error(`"${from}" is not there`)

  const written: string[] = []

  // The includes first: if one of them fails, nothing has moved yet.
  for (const file of await listInkFiles(project)) {
    if (file.path === from) continue

    let text: string
    try {
      text = stripBom(await readFile(file.absolutePath, 'utf8'))
    } catch {
      continue
    }

    const next = rewriteIncludes(file.path, text, from, to)
    if (next === null) continue

    await writeFile(file.absolutePath, next, 'utf8')
    written.push(file.path)
  }

  await mkdir(dirname(target), { recursive: true })
  await rename(source, target)
  await pruneEmptyFolders(project.path, dirname(source))

  // The file's own includes are written relative to it, so moving it into
  // another folder changes what they have to say.
  await repointOwnIncludes(from, to, target)

  if (project.main === from) {
    await saveProject({ ...project, main: to })
    written.push('project.md')
  }

  if (await repointPlan(project, from, to)) written.push('plan.json')

  return { path: to, written }
}

/**
 * A free name for `name` inside `folder`, as `name-2`, `name-3` and so on.
 *
 * Hyphenated rather than underscored because these are file names, which this
 * project slugifies, and `safePath` will not accept an underscore.
 */
async function freeName(project: Project, folder: string, name: string): Promise<string> {
  const at = (candidate: string): string =>
    folder ? `${folder}/${candidate}.ink` : `${candidate}.ink`

  if (!(await exists(toDisk(project, at(name))))) return at(name)

  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = at(`${name}-${suffix}`)
    if (!(await exists(toDisk(project, candidate)))) return candidate
  }

  throw new Error(`No free name left for "${name}"`)
}

/**
 * Copies one ink file into a folder.
 *
 * Nothing is rewritten anywhere else, and that is the difference from a move:
 * a copy is a new file that nothing points at yet. Its *own* includes are
 * repointed, because they were written for wherever it came from.
 */
export async function copyInkFile(
  project: Project,
  from: string,
  toFolder: string
): Promise<MoveResult> {
  const source = toDisk(project, from)
  if (!(await exists(source))) throw new Error(`"${from}" is not there`)

  const base = from.slice(from.lastIndexOf('/') + 1).replace(/\.ink$/i, '')
  const to = await freeName(project, toFolder, base)
  const target = safePath(project.path, to.replace(/\.ink$/i, ''), '.ink')

  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, stripBom(await readFile(source, 'utf8')), 'utf8')
  await repointOwnIncludes(from, to, target)

  return { path: to, written: [] }
}

/**
 * The moved file's own INCLUDE lines, rewritten for where it now sits.
 *
 * `INCLUDE state.ink` in `ink/main.ink` becomes `INCLUDE ../state.ink` when the
 * file moves into `ink/act-one/`. Nothing else notices, and the story stops
 * compiling on a line the author never touched.
 */
async function repointOwnIncludes(from: string, to: string, target: string): Promise<void> {
  let text: string
  try {
    text = stripBom(await readFile(target, 'utf8'))
  } catch {
    return
  }

  const lines = text.split('\n')
  let changed = false

  // Each one is read against where the file *was* and rewritten for where it
  // *is*. The project-relative target between the two is what does not change.
  for (const include of includesIn(from, text)) {
    const wanted = relativeInclude(to, include.target)
    if (wanted === include.written) continue

    lines[include.line] = lines[include.line]!.replace(include.written, wanted)
    changed = true
  }

  if (changed) await writeFile(target, lines.join('\n'), 'utf8')
}

async function repointPlan(project: Project, from: string, to: string): Promise<boolean> {
  // Read the document without the normal plan repair pass. At this point the
  // file has already moved; `readPlan` would see the old attachment missing
  // and helpfully recreate a blank Scene there before we could repoint it.
  let plan
  try {
    plan = parsePlan(stripBom(await readFile(join(project.path, 'plan.json'), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  let changed = false

  const swap = (files: string[]): string[] =>
    files.map((file) => {
      if (file !== from) return file
      changed = true
      return to
    })

  const walk = (nodes: typeof plan.nodes): typeof plan.nodes =>
    nodes.map((node) => ({ ...node, files: swap(node.files), children: walk(node.children) }))

  const destinationFolder = to.includes('/') ? to.slice(0, to.lastIndexOf('/')) : null
  const nodes = plan.nodes.map((act) => ({
    ...act,
    files: swap(act.files),
    children: act.children.map((chapter) => {
      const ownsMovedScene = chapter.children.some((scene) => scene.files.includes(from))
      return {
        ...chapter,
        folder: ownsMovedScene ? destinationFolder : chapter.folder,
        files: swap(chapter.files),
        children: walk(chapter.children)
      }
    })
  }))

  const next = { ...plan, globals: swap(plan.globals), nodes }
  if (changed) await writeFile(join(project.path, 'plan.json'), serialisePlan(next), 'utf8')
  return changed
}

/**
 * Deletes a file, or a folder and everything in it.
 *
 * The caller is expected to have asked first — `referencesTo` is what it asks
 * with. Nothing here refuses, because an author who has been told what breaks
 * and said yes is allowed to break it.
 */
export async function deleteInkPath(project: Project, path: string): Promise<void> {
  const absolute = toDisk(project, path)
  await rm(absolute, { recursive: true, force: true })
  await pruneEmptyFolders(project.path, dirname(absolute))
}
