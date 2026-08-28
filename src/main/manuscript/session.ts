import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { Story } from 'inkjs/engine/Story'
import {
  emptyManuscript,
  sectionsOf,
  type JunctionNode,
  type Manuscript,
  type PathStep
} from '@shared/manuscript'
import type { Project } from '@shared/project'
import type { TagCommand } from '@shared/bundle/tagSpec'
import { compileStory } from '../ink/compiler'
import { listInkFiles } from '../project'
import { stripBom } from '../text'
import { firstReferences, walkBack } from './backtrack'
import { advance, countWords } from './build'
import {
  canReplaceSection,
  insertAfterSection,
  replaceSection,
  sanitiseDraft,
  type ReplaceCheck
} from './compose'
import { applyEdit, SourceCache } from './edit'
import { findPathToKnot } from './pathfind'
import {
  newTagLine,
  removeTag,
  replaces,
  rewriteTag,
  sectionTagBlock,
  stillThere,
  type TagBlock
} from './sectionTags'

/**
 * A live reading of one story.
 *
 * The Story object is kept rather than recompiled per interaction, because debug
 * metadata only exists on the compiler's in-memory story and would be lost
 * through JSON. Keeping it also makes changing a junction a state restore rather
 * than a replay from the beginning.
 *
 * One session at a time: this is a reading view, and two would only compete for
 * the same window.
 */
interface Session {
  story: Story
  project: Project
  entryPath: string
  entryRelative: string
  manuscript: Manuscript
  sources: SourceCache
  /**
   * State as it was *before* each junction was chosen, keyed by node id.
   * Restoring one rewinds the story to that decision.
   */
  snapshots: Map<string, string>
  nextIdCounter: number
}

let session: Session | null = null

function projectRelative(project: Project, absolutePath: string): string {
  return relative(project.path, absolutePath).split(sep).join('/')
}

/** Runs forward from wherever the story is, appending to the manuscript. */
function extend(current: Session): void {
  const { nodes } = advance(
    current.story,
    current.project.path,
    dirname(current.entryPath),
    () => `n${current.nextIdCounter++}`,
    current.sources
  )

  current.manuscript.nodes.push(...nodes)
  current.manuscript.wordCount = countWords(current.manuscript.nodes)
  current.manuscript.complete = nodes.some((node) => node.kind === 'ending')
}

function lastNode(current: Session): JunctionNode | null {
  const node = current.manuscript.nodes[current.manuscript.nodes.length - 1]
  return node?.kind === 'junction' && node.chosenIndex === null ? node : null
}

/** Records the snapshot, marks the junction and steps through it. */
function take(current: Session, junction: JunctionNode, step: PathStep): void {
  current.snapshots.set(junction.id, current.story.state.ToJson())
  junction.chosenIndex = step.choiceIndex
  current.manuscript.path.push(step)
  current.story.ChooseChoiceIndex(step.choiceIndex)
  extend(current)
}

/**
 * Walks a recorded path back onto a freshly compiled story.
 *
 * A step is only applied while the choice at its index is still the same choice
 * point it was recorded against. Once the story has been edited past
 * recognition the replay stops there and the reader takes over by hand, which
 * is better than following stale indices into a different branch.
 */
function replay(current: Session, path: PathStep[]): void {
  extend(current)

  for (const step of path) {
    const junction = lastNode(current)
    if (!junction) break

    const choice = current.story.currentChoices[step.choiceIndex]
    if (!choice || choice.sourcePath !== step.sourcePath) break

    take(current, junction, step)
  }
}

async function build(
  project: Project,
  entryRelativePath: string,
  path: PathStep[]
): Promise<Manuscript> {
  const entryPath = join(project.path, entryRelativePath.split('/').join(sep))
  const label = projectRelative(project, entryPath)

  // Compiled from disk, so what is read is what is saved. The caller saves the
  // editor buffer first; a manuscript of unsaved text would not match the story
  // anyone else would get.
  let source: string
  try {
    source = stripBom(await readFile(entryPath, 'utf8'))
  } catch (error) {
    session = null
    const manuscript = emptyManuscript(entryPath, label)
    manuscript.diagnostics = [error instanceof Error ? error.message : String(error)]
    return manuscript
  }

  // countAllVisits so the path search can ask whether any knot has been reached,
  // including one nothing in the script read-counts.
  const compiled = compileStory({ source, filePath: entryPath }, { countAllVisits: true })
  const errors = compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

  if (!compiled.story || errors.length > 0) {
    session = null
    const manuscript = emptyManuscript(entryPath, label)
    manuscript.diagnostics = errors.map((diagnostic) => diagnostic.raw)
    return manuscript
  }

  session = {
    story: compiled.story,
    project,
    entryPath,
    entryRelative: entryRelativePath,
    manuscript: emptyManuscript(entryPath, label),
    sources: new SourceCache(project.path),
    snapshots: new Map(),
    nextIdCounter: 0
  }

  replay(session, path)
  return session.manuscript
}

export function openManuscript(project: Project, entryRelativePath: string): Promise<Manuscript> {
  return build(project, entryRelativePath, [])
}

/** Recompiles from disk and puts the reader back where it was. */
export function rereadManuscript(): Promise<Manuscript> {
  const current = session
  if (!current) throw new Error('No manuscript is open.')
  return build(current.project, current.entryRelative, [...current.manuscript.path])
}

/**
 * Chooses at a junction.
 *
 * For the open junction at the end this simply advances. For an earlier one it
 * restores that junction's snapshot and discards everything after it — which is
 * the whole point of the view: a choice invalidates the story that followed it,
 * so that story is thrown away rather than left to disagree with the path.
 */
export function chooseAt(nodeId: string, choiceIndex: number): Manuscript {
  const current = session
  if (!current) throw new Error('No manuscript is open.')

  const nodes = current.manuscript.nodes
  const position = nodes.findIndex((node) => node.id === nodeId)
  const junction = nodes[position]
  if (position === -1 || junction?.kind !== 'junction') {
    throw new Error(`No junction with id ${nodeId}`)
  }

  const choice = junction.choices[choiceIndex]
  if (!choice) throw new Error(`No choice ${choiceIndex} at junction ${nodeId}`)

  if (junction.chosenIndex !== null) {
    const snapshot = current.snapshots.get(nodeId)
    if (!snapshot) throw new Error(`No saved state for junction ${nodeId}`)
    current.story.state.LoadJson(snapshot)

    // Everything after this junction described a path that is no longer taken.
    for (const stale of nodes.slice(position + 1)) current.snapshots.delete(stale.id)
    current.manuscript.nodes = nodes.slice(0, position + 1)

    const decidedBefore = current.manuscript.nodes
      .slice(0, position)
      .filter((node) => node.kind === 'junction').length
    current.manuscript.path = current.manuscript.path.slice(0, decidedBefore)
  }

  take(current, junction, {
    sourcePath: current.story.currentChoices[choiceIndex]?.sourcePath ?? '',
    choiceIndex,
    choiceText: choice.text
  })

  return current.manuscript
}

export interface EditOutcome {
  manuscript: Manuscript
  /** Null on success; otherwise why the edit was refused. */
  error: string | null
}

/**
 * Rewrites the ink behind a line of the manuscript.
 *
 * The file is the save format for both views, so this replaces the exact span
 * that produced the text and nothing else. Afterwards the story is recompiled
 * and the path replayed, because the edit may have shifted every line number
 * after it.
 */
export async function editNode(
  nodeId: string,
  choiceIndex: number | null,
  text: string
): Promise<EditOutcome> {
  const current = session
  if (!current) throw new Error('No manuscript is open.')

  const node = current.manuscript.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) throw new Error(`No node with id ${nodeId}`)

  const target =
    choiceIndex === null
      ? node.kind === 'prose'
        ? { source: node.source, previous: node.text, edit: node.edit }
        : null
      : node.kind === 'junction'
        ? (() => {
            const choice = node.choices.find((candidate) => candidate.index === choiceIndex)
            return choice ? { source: choice.source, previous: choice.text, edit: choice.edit } : null
          })()
        : null

  if (!target) throw new Error('That node cannot be edited.')
  if (!target.source) {
    return { manuscript: current.manuscript, error: 'This line has no known source to write to.' }
  }
  if (!target.edit.editable) {
    return { manuscript: current.manuscript, error: target.edit.reason }
  }

  const result = await applyEdit(current.project.path, target.source, target.previous, text)
  if (!result.ok) return { manuscript: current.manuscript, error: result.message }

  return { manuscript: await rereadManuscript(), error: null }
}

/** Rewinds to the start and walks a path back in, discarding the current reading. */
function resetAndReplay(current: Session, path: PathStep[]): void {
  current.story.ResetState()
  current.manuscript.nodes = []
  current.manuscript.path = []
  current.manuscript.wordCount = 0
  current.manuscript.complete = false
  current.nextIdCounter = 0
  current.snapshots.clear()
  replay(current, path)
}

/**
 * Rewinds and begins the reading at a knot instead of at the story's start.
 *
 * The fallback when nothing routes to it. A scene no path reaches is still a
 * scene worth reading — half-written branches and knots whose only caller is
 * not written yet are the normal state of a story in progress — so the reading
 * begins there rather than refusing and leaving the previous page up.
 *
 * Returns false when ink will not go there at all, which is a knot that does
 * not exist rather than one nothing reaches.
 */
function resetAndStartAt(current: Session, knot: string): boolean {
  current.story.ResetState()
  current.manuscript.nodes = []
  current.manuscript.path = []
  current.manuscript.wordCount = 0
  current.manuscript.complete = false
  current.nextIdCounter = 0
  current.snapshots.clear()

  try {
    current.story.ChoosePathString(knot)
  } catch {
    return false
  }

  extend(current)
  return true
}

export interface TraceOutcome {
  manuscript: Manuscript
  /** Choices it took to get there. */
  steps: number
  /**
   * Null when the reading runs from the story's beginning, which is the good
   * case. Otherwise the knot it had to begin at instead, which may be some way
   * back from the one asked for. The manuscript is real either way; this is
   * what lets the reader be told which of the two they have.
   */
  startedAt: string | null
  error: string | null
}

/**
 * Populates the manuscript with a path that reaches `knot`.
 *
 * This is the question an ink file cannot answer by inspection: how does anyone
 * ever get to this ending? Several routes may reach it, in which case the
 * shortest is taken — any of them is a correct answer, and the shortest is the
 * least arbitrary-looking.
 */
export async function traceToKnot(
  project: Project,
  entryRelativePath: string,
  knot: string
): Promise<TraceOutcome> {
  const reusable =
    session && session.project.path === project.path && session.entryRelative === entryRelativePath

  if (!reusable) await build(project, entryRelativePath, [])

  const current = session
  if (!current) {
    return {
      manuscript: session?.manuscript ?? emptyManuscript('', entryRelativePath),
      steps: 0,
      startedAt: null,
      error: 'The story does not compile, so no path through it can be found.'
    }
  }

  const previous = [...current.manuscript.path]
  const result = findPathToKnot(current.story, knot)

  // The search left the story wherever it stopped, so every outcome below has
  // to put the reader back on a real path.
  if (result.found) {
    resetAndReplay(current, result.path)
    return { manuscript: current.manuscript, steps: result.path.length, startedAt: null, error: null }
  }

  // No route was found — either none exists, or the search ran out of budget
  // looking, which is what happens to anything deep in a long story. Fall back
  // to reading the source backwards for somewhere to begin: whoever diverts to
  // this knot, and whoever diverts to them, until nothing does.
  for (const candidate of await startingPoints(current, project, knot)) {
    if (!resetAndStartAt(current, candidate)) continue
    return { manuscript: current.manuscript, steps: 0, startedAt: candidate, error: null }
  }

  resetAndReplay(current, previous)
  return { manuscript: current.manuscript, steps: 0, startedAt: null, error: result.message }
}

/**
 * Knots worth trying as an opening, best first.
 *
 * The head of the divert chain is what was asked for. The target itself is the
 * fallback behind it, because a chain whose head ink refuses to jump to is
 * still better than no reading at all.
 */
async function startingPoints(
  current: Session,
  project: Project,
  knot: string
): Promise<string[]> {
  const sources: Array<[string, string[]]> = []
  for (const file of await listInkFiles(project)) {
    const lines = current.sources.lines(file.path)
    if (lines) sources.push([file.path, lines])
  }

  const chain = walkBack(knot, firstReferences(sources))
  return chain[0] === knot ? [knot] : [chain[0]!, knot]
}

/** Whether a section's span can be overwritten, for enabling the UI. */
export function sectionReplaceable(sectionIndex: number): ReplaceCheck {
  const current = session
  if (!current) throw new Error('No manuscript is open.')

  const section = sectionsOf(current.manuscript)[sectionIndex]
  if (!section) return { safe: false, reason: 'No such section.', file: null, from: 0, to: 0 }

  return canReplaceSection(section.nodes, (file) => current.sources.lines(file))
}

export type ComposeMode = 'insert' | 'replace'

/** Puts drafted prose into the ink, then recompiles and replays the path. */
export async function composeIntoSection(
  sectionIndex: number,
  mode: ComposeMode,
  text: string
): Promise<EditOutcome> {
  const current = session
  if (!current) throw new Error('No manuscript is open.')

  const section = sectionsOf(current.manuscript)[sectionIndex]
  if (!section) return { manuscript: current.manuscript, error: 'No such section.' }

  const paragraphs = sanitiseDraft(text)

  const result =
    mode === 'replace'
      ? await replaceSection(
          current.project.path,
          canReplaceSection(section.nodes, (file) => current.sources.lines(file)),
          paragraphs
        )
      : await insertAfterSection(current.project.path, section.nodes, paragraphs)

  if (!result.ok) return { manuscript: current.manuscript, error: result.message }

  return { manuscript: await rereadManuscript(), error: null }
}

/**
 * Staging a section: the tags a scene is made of, written into its ink.
 *
 * The rail beside each section of the manuscript edits `#` lines the way the
 * right-click menu does in the editor, and this is the write half of it. Both
 * operations are line edits on the file, like every other write here, followed
 * by a recompile — the ink stays the save format and the manuscript stays a
 * projection of it.
 */

/** The block for one section, or the reason there is not one. */
function blockFor(current: Session, sectionIndex: number): TagBlock | string {
  const section = sectionsOf(current.manuscript)[sectionIndex]
  if (!section) return 'No such section.'

  const block = sectionTagBlock(section.nodes, (file) => current.sources.lines(file))
  return block.reason ?? block
}

/** Reads a file for editing, keeping whatever newline it was written with. */
async function readForEdit(
  projectPath: string,
  file: string
): Promise<{ lines: string[]; newline: string }> {
  const contents = stripBom(await readFile(join(projectPath, file.split('/').join(sep)), 'utf8'))
  return { lines: contents.split(/\r?\n/), newline: contents.includes('\r\n') ? '\r\n' : '\n' }
}

async function saveLines(
  projectPath: string,
  file: string,
  lines: string[],
  newline: string
): Promise<void> {
  await writeFile(join(projectPath, file.split('/').join(sep)), lines.join(newline), 'utf8')
}

/**
 * Sets one thing about a section's staging.
 *
 * Replaces the tag already saying something about that subject, and adds one at
 * the top of the section when nothing does — so setting the background twice
 * changes one line rather than stacking two contradictory ones, while showing a
 * second character leaves the first standing. `replaces` owns that distinction.
 *
 * `replacing` names a tag to rewrite instead, by exactly the text in the file,
 * and is how editing differs from adding. The subject rule cannot serve both:
 * changing a row from Wren to Kael is one edit to the author and two different
 * subjects to `replaces`, which would leave Wren standing and add Kael beside
 * her. Naming the tag also keeps it where the author put it, rather than
 * removing a line and appending a new one at the top of the block.
 */
export async function setSectionTag(
  sectionIndex: number,
  command: TagCommand,
  replacing?: string
): Promise<EditOutcome> {
  const current = session
  if (!current) throw new Error('No manuscript is open.')

  const block = blockFor(current, sectionIndex)
  if (typeof block === 'string') return { manuscript: current.manuscript, error: block }
  if (!block.file || block.insertAt === null) {
    return { manuscript: current.manuscript, error: block.reason }
  }

  const { lines, newline } = await readForEdit(current.project.path, block.file)

  // A named tag that is no longer there falls back to the subject rule rather
  // than refusing: the author asked to change this row, and the row is still on
  // screen, so writing the tag is a better answer than an error about a line.
  const named = replacing ? block.tags.findIndex((one) => one.raw === replacing) : -1
  const at = named === -1 ? replaces(block.tags, command) : named

  if (at === -1) {
    lines.splice(block.insertAt - 1, 0, newTagLine(lines, block.insertAt, command))
  } else {
    const tag = block.tags[at]!
    const line = lines[tag.line - 1]

    if (!stillThere(line, tag)) {
      return {
        manuscript: current.manuscript,
        error: 'The source has changed since it was read. Reread the manuscript and try again.'
      }
    }

    lines[tag.line - 1] = rewriteTag(line!, tag, command)
  }

  await saveLines(current.project.path, block.file, lines, newline)
  return { manuscript: await rereadManuscript(), error: null }
}

/**
 * Takes one tag out of a section, named by exactly the text in the file.
 *
 * By raw text rather than by parsed command, because the file is the save
 * format: a tag put back through `formatTag` may not be the characters actually
 * written, and removing the wrong line is worse than refusing.
 */
export async function clearSectionTag(sectionIndex: number, raw: string): Promise<EditOutcome> {
  const current = session
  if (!current) throw new Error('No manuscript is open.')

  const block = blockFor(current, sectionIndex)
  if (typeof block === 'string') return { manuscript: current.manuscript, error: block }
  if (!block.file) return { manuscript: current.manuscript, error: block.reason }

  const tag = block.tags.find((one) => one.raw === raw)
  if (!tag) {
    return { manuscript: current.manuscript, error: `This section no longer has a "${raw}" tag.` }
  }

  const { lines, newline } = await readForEdit(current.project.path, block.file)
  const line = lines[tag.line - 1]
  if (!stillThere(line, tag)) {
    return {
      manuscript: current.manuscript,
      error: 'The source has changed since it was read. Reread the manuscript and try again.'
    }
  }

  const without = removeTag(line!, tag)
  if (without === null) lines.splice(tag.line - 1, 1)
  else lines[tag.line - 1] = without

  await saveLines(current.project.path, block.file, lines, newline)
  return { manuscript: await rereadManuscript(), error: null }
}

/** The manuscript as it stands, for building AI context in the main process. */
export function currentManuscript(): Manuscript | null {
  return session?.manuscript ?? null
}

/** The project being read, so the AI context can load the codex it draws on. */
export function currentProject(): Project | null {
  return session?.project ?? null
}

export function closeManuscript(): void {
  session = null
}
