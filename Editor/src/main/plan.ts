import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { slugify, slugifyPath } from '@shared/codex'
import { includesIn, orderIncludes, relativeInclude, rewriteIncludes } from '@shared/inkRefs'
import { scanKnots } from '@shared/inkKnots'
import {
  emptyPlan,
  duplicateKnots,
  findPlanNode,
  insertPlanNode,
  knotOf,
  migratePlanScenes,
  parsePlan,
  planFromMarkdown,
  serialisePlan,
  updatePlanNode,
  type PlanDocument,
  type PlanNode
} from '@shared/planDoc'
import type { Project } from '@shared/project'
import { exists } from './fs'
import { listInkFiles } from './project'
import { stripBom } from './text'
import { writeWatched } from './watch'

/**
 * The plan lives at `plan.json` in the project directory, beside `project.md`
 * and the `ink/` tree.
 *
 * JSON because it is the app's own document: only the ink is a format anyone
 * else needs to read. Markdown remains the way a plan gets *in* — see the
 * import below, and the paste-markdown affordance in the plan view.
 */
const PLAN_FILE = 'plan.json'
/** What the plan used to be kept as, imported once if it is still there. */
const LEGACY_OUTLINE = 'outline.md'

export async function readPlan(project: Project): Promise<PlanDocument> {
  try {
    const source = stripBom(await readFile(join(project.path, PLAN_FILE), 'utf8'))
    const stored = await storePlan(project, parsePlan(source))
    return stored.plan
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  // A project written before the plan was JSON still has its outline; bring it
  // across rather than presenting the author with an empty board.
  try {
    const markdown = stripBom(await readFile(join(project.path, LEGACY_OUTLINE), 'utf8'))
    if (markdown.trim().length === 0) return emptyPlan()

    const imported = planFromMarkdown(markdown)
    return writePlan(project, imported)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return emptyPlan()
  }
}

export async function writePlan(project: Project, plan: PlanDocument): Promise<PlanDocument> {
  return (await writePlanWithResult(project, plan)).plan
}

/** The detailed form used by tools that must report every generated file. */
export function writePlanWithResult(
  project: Project,
  plan: PlanDocument
): Promise<{ plan: PlanDocument; written: string[] }> {
  return storePlan(project, plan)
}

/** Creates a Scene only under a chapter, then lets the normal writer mint its file. */
export async function createPlanScene(
  project: Project,
  plan: PlanDocument,
  chapterId: string,
  title: string
): Promise<{ plan: PlanDocument; file: string; written: string[] }> {
  const clean = title.trim()
  if (clean.length === 0) throw new Error('A Scene needs a title.')

  const chapter = plan.nodes.flatMap((act) => act.children).find((node) => node.id === chapterId)
  if (!chapter) throw new Error('Scenes can only be created inside a chapter.')

  const inserted = insertPlanNode(plan, chapterId, clean)
  const clashes = duplicateKnots(inserted.plan)
  if (clashes.length > 0) {
    throw new Error(
      `A Scene already uses the Ink knot “${clashes[0]}”. Give this Scene a different title.`
    )
  }
  const stored = await storePlan(project, inserted.plan)
  const scene = findPlanNode(stored.plan, inserted.node.id)
  const file = scene?.files[0]
  if (!file) throw new Error('The Scene file could not be created.')
  return { plan: stored.plan, file, written: stored.written }
}

async function storePlan(
  project: Project,
  input: PlanDocument
): Promise<{ plan: PlanDocument; written: string[] }> {
  const migratedFiles = new Set(
    input.nodes.flatMap((act) => act.children.flatMap((chapter) => chapter.files))
  )
  let plan = migratePlanScenes(input)
  plan = assignChapterFolders(plan)
  const written: string[] = []
  const used = new Set<string>()
  const knots = new Set<string>()

  // Legacy chapters often used a friendly title while their file started at a
  // short knot such as `chapter1`. The migrated Scene should point at the knot
  // that already exists; changing the Ink would break incoming diverts.
  for (const act of plan.nodes) {
    for (const chapter of act.children) {
      for (const scene of chapter.children) {
        const file = scene.files[0]
        if (!file || !migratedFiles.has(file)) continue
        try {
          const source = stripBom(await readFile(onDisk(project, file), 'utf8'))
          const declarations = scanKnots(source).filter((knot) => !knot.isFunction && !knot.isStitch)
          if (declarations.length > 0 && !declarations.some((knot) => knot.name === knotOf(scene))) {
            plan = updatePlanNode(plan, scene.id, { knot: declarations[0]!.name })
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
    }
  }

  // A duplicate title must never make the app generate two identical knot
  // declarations. Normal creation refuses the duplicate above; imported old
  // plans are repaired by giving only a not-yet-authored Scene a stable
  // override. Existing Ink is never renamed behind the author's back.
  for (const act of plan.nodes) {
    for (const chapter of act.children) {
      for (const scene of chapter.children) {
        let knot = knotOf(scene)
        if (knots.has(knot) && scene.files.length === 0) {
          const base = knot
          let suffix = scene.id.slice(-6).toLowerCase()
          knot = `${base}_${suffix}`
          for (let attempt = 2; knots.has(knot); attempt++) knot = `${base}_${suffix}_${attempt}`
          plan = updatePlanNode(plan, scene.id, { knot })
        }
        knots.add(knot)
      }
    }
  }

  const collect = (nodes: PlanNode[]): void => {
    for (const node of nodes) {
      for (const file of node.files) used.add(file)
      collect(node.children)
    }
  }
  collect(plan.nodes)
  for (const file of plan.globals) used.add(file)

  for (const act of plan.nodes) {
    for (const chapter of act.children) {
      // A chapter owns its folder even before it owns a Scene. This keeps the
      // plan reference truthful and makes the folder visible in the file tree
      // as soon as the chapter is saved.
      await mkdir(onDisk(project, chapter.folder!), { recursive: true })
      for (const scene of chapter.children) {
        let file = scene.files[0]

        // A Scene moved to another Chapter moves on disk as well. The file is
        // app-managed, and leaving it in the old Chapter would make the folder
        // reference a label rather than the guardrail it is meant to be.
        if (
          file &&
          fileFolder(file) !== chapter.folder &&
          file !== project.main &&
          await exists(onDisk(project, file))
        ) {
          const oldFile = file
          const base = slugify(basename(oldFile, '.ink'))
          file = await freeScenePath(project, chapter.folder!, base, used)
          written.push(...await moveManagedSceneFile(project, oldFile, file), file)
          used.delete(oldFile)
          used.add(file)
          plan = updatePlanNode(plan, scene.id, { files: [file] })
        }

        file ??= await freeScenePath(project, chapter.folder!, slugify(scene.title), used)
        const absolute = onDisk(project, file)
        if (!(await exists(absolute))) {
          await mkdir(dirname(absolute), { recursive: true })
          await writeFile(absolute, sceneInk(scene), 'utf8')
          written.push(file)
        }
        used.add(file)
        if (scene.files[0] !== file) plan = updatePlanNode(plan, scene.id, { files: [file] })
      }
    }
  }

  // One group per chapter, acts in order: the entry point should list the story
  // the way the outline reads it.
  const chapterFiles = plan.nodes.flatMap((act) =>
    act.children.map((chapter) =>
      chapter.children.flatMap((scene) => scene.files.slice(0, 1))
    )
  )
  if (await orderSceneIncludes(project, chapterFiles)) written.push(project.main)

  await writeWatched(join(project.path, PLAN_FILE), serialisePlan(plan))
  written.push(PLAN_FILE)
  return { plan, written }
}

/**
 * Moves one app-managed Scene and follows every Ink INCLUDE that names it.
 * Plan ownership is updated by the caller, after the move succeeds.
 */
async function moveManagedSceneFile(
  project: Project,
  from: string,
  to: string
): Promise<string[]> {
  const source = onDisk(project, from)
  const target = onDisk(project, to)
  const written: string[] = []

  // Rewrite referring files first. If one cannot be written, the Scene has not
  // moved yet and the original story remains intact.
  for (const file of await listInkFiles(project)) {
    if (file.path === from) continue
    const text = stripBom(await readFile(file.absolutePath, 'utf8'))
    const next = rewriteIncludes(file.path, text, from, to)
    if (next === null) continue
    await writeFile(file.absolutePath, next, 'utf8')
    written.push(file.path)
  }

  await mkdir(dirname(target), { recursive: true })
  await rename(source, target)

  // Includes inside the moved Scene were relative to its old folder. Their
  // project targets stay fixed, so rewrite only how this file reaches them.
  const own = stripBom(await readFile(target, 'utf8'))
  const lines = own.split('\n')
  let ownChanged = false
  for (const include of includesIn(from, own)) {
    const wanted = relativeInclude(to, include.target)
    if (wanted === include.written) continue
    lines[include.line] = lines[include.line]!.replace(include.written, wanted)
    ownChanged = true
  }
  if (ownChanged) await writeFile(target, lines.join('\n'), 'utf8')

  return written
}

function onDisk(project: Project, path: string): string {
  const absolute = resolve(project.path, path.split('/').join(sep))
  const inside = relative(project.path, absolute)
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`Plan path escapes the project: ${path}`)
  }
  return absolute
}

function sceneInk(scene: PlanNode): string {
  return `// Scene: ${scene.title}\n\n=== ${knotOf(scene)} ===\n\n-> END\n`
}

async function freeScenePath(
  project: Project,
  folder: string,
  base: string,
  used: Set<string>
): Promise<string> {
  for (let suffix = 1; suffix < 1000; suffix++) {
    const name = suffix === 1 ? base : `${base}-${suffix}`
    const path = `${folder}/${name}.ink`
    if (!used.has(path) && !(await exists(onDisk(project, path)))) return path
  }
  throw new Error(`No free Scene filename remains for “${base}”.`)
}

const GENERIC_INK_FOLDERS = new Set(['ink', 'ink/scenes'])

/** The directory part of a project-relative file path. */
function fileFolder(path: string): string | null {
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? null : path.slice(0, cut)
}

/**
 * Gives every Chapter a stable folder without deriving it again after a title
 * rename. Existing chapter-shaped folders win; old generic `ink/` and
 * `ink/scenes/` locations do not, because sharing either would recreate the
 * flat pile this field exists to replace.
 */
function assignChapterFolders(plan: PlanDocument): PlanDocument {
  const claimed = new Set<string>()

  const acts = plan.nodes.map((act) => ({
    ...act,
    folder: null,
    children: act.children.map((chapter) => {
      const inferred = chapter.children
        .flatMap((scene) => scene.files.slice(0, 1))
        .map(fileFolder)
        .find((folder): folder is string => folder !== null && !GENERIC_INK_FOLDERS.has(folder))

      const base = slugifyPath(chapter.folder ?? inferred ?? chapter.title) || 'chapter'
      let folder = base
      for (let suffix = 2; claimed.has(folder.toLowerCase()); suffix++) {
        folder = `${base}-${suffix}`
      }
      claimed.add(folder.toLowerCase())

      return {
        ...chapter,
        folder,
        files: [],
        children: chapter.children.map((scene) => ({ ...scene, folder: null, children: [] }))
      }
    })
  }))

  return { ...plan, nodes: acts }
}

/**
 * Declares every Scene in the entry point, in the order the outline reads.
 *
 * A missing INCLUDE used to be prepended, which meant the entry point ended up
 * listing the story backwards — newest first, and older chapters wherever they
 * had landed. Reordering the whole block instead makes the file say what the
 * plan says. What the plan does not own — a map, the state catalogue, ink the
 * author included themselves — is kept and follows at the end.
 */
async function orderSceneIncludes(project: Project, chapterFiles: string[][]): Promise<boolean> {
  const entry = onDisk(project, project.main)
  let source: string
  try {
    source = stripBom(await readFile(entry, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }

  const next = orderIncludes(project.main, source, chapterFiles)
  if (next === null) return false

  await writeFile(entry, next, 'utf8')
  return true
}
