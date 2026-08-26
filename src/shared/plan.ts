import type { CodexEntry } from './codex'
import type { KnotSource } from './inkKnots'
import { selectCodexEntries } from './codexContext'
import type { Section } from './manuscript'
import { knotOf, roleAtDepth, type PlanDocument, type PlanNode, type PlanRole } from './planDoc'

/**
 * Reading the plan: acts, chapters and scenes, and the characters in each.
 *
 * Characters are tracked rather than typed. A chapter's cast is whoever the
 * codex recognises in its summary and in the summaries beneath it — the same
 * detection the AI context uses, so what the board shows a character to be in
 * is what the model would be told.
 */

/** A node's own summary plus every summary beneath it. */
export function summaryTreeText(node: PlanNode): string {
  const parts = [node.summary]
  for (const child of node.children) parts.push(summaryTreeText(child))
  return parts.filter((part) => part.trim().length > 0).join('\n\n')
}

export function charactersOf(node: PlanNode, entries: CodexEntry[]): CodexEntry[] {
  // The Matrix is a cast tracker, not a general codex mention report. Filter
  // before selection so an always-included location, or a relation from a
  // character to an item, cannot be pulled back into the result afterward.
  return selectCodexEntries(
    summaryTreeText(node),
    entries.filter((entry) => entry.type === 'character')
  ).entries
}

export interface PlanChapter {
  node: PlanNode
  characters: CodexEntry[]
}

export interface PlanAct {
  node: PlanNode
  chapters: PlanChapter[]
  characters: CodexEntry[]
}

export function planActs(plan: PlanDocument, entries: CodexEntry[]): PlanAct[] {
  return plan.nodes.map((act) => ({
    node: act,
    characters: charactersOf(act, entries),
    chapters: act.children.map((chapter) => ({
      node: chapter,
      characters: charactersOf(chapter, entries)
    }))
  }))
}

export interface PlanMatrixData {
  /** Every chapter across every act, in reading order. */
  chapters: PlanNode[]
  characters: CodexEntry[]
  /** `${characterId}:${chapterId}` for each appearance. */
  appearances: Set<string>
}

export function planMatrix(plan: PlanDocument, entries: CodexEntry[]): PlanMatrixData {
  // An act with no chapters stands in for itself, so it still gets a column.
  const chapters = plan.nodes.flatMap((act) => (act.children.length > 0 ? act.children : [act]))

  const appearances = new Set<string>()
  const characters = new Map<string, CodexEntry>()

  for (const chapter of chapters) {
    for (const character of charactersOf(chapter, entries)) {
      characters.set(character.id, character)
      appearances.add(`${character.id}:${chapter.id}`)
    }
  }

  return {
    chapters,
    characters: [...characters.values()].sort((a, b) => a.name.localeCompare(b.name)),
    appearances
  }
}

/**
 * The knot a manuscript section belongs to.
 *
 * A section opens with the text of the choice that led into it, and that text
 * still belongs to the knot the reader was *leaving*; only then does the story
 * divert into the knot the section is actually about. Taking the first knot
 * therefore files every section under the chapter before it.
 *
 * The knot contributing the most lines is the subject. Ties go to the later one,
 * which is where the reader ends up.
 */
export function sectionKnot(section: Section): string | null {
  const counts = new Map<string, number>()

  for (const node of section.nodes) {
    if (node.knot === null) continue
    counts.set(node.knot, (counts.get(node.knot) ?? 0) + 1)
  }

  let best: string | null = null
  let bestCount = 0
  for (const [knot, count] of counts) {
    if (count >= bestCount) {
      best = knot
      bestCount = count
    }
  }

  return best
}

export interface FilePlacement {
  /** App-managed Scene files, with the Scene that owns each one. */
  local: Map<string, PlanNode[]>
  /** Files marked as belonging to the story rather than a section. */
  globals: string[]
  /** In the project but placed nowhere — visible, so it can be dealt with. */
  unassigned: string[]
}

/**
 * Where each of the project's ink files sits in the plan.
 *
 * Unassigned is deliberately its own category rather than being folded into
 * global. A file nobody has placed yet is a loose end worth showing; a file
 * that genuinely belongs to the whole story — an overworld map, shared
 * functions — is a decision someone made.
 */
export function placeFiles(plan: PlanDocument, projectFiles: string[]): FilePlacement {
  const local = new Map<string, PlanNode[]>()

  const walk = (nodes: PlanNode[]): void => {
    for (const node of nodes) {
      for (const path of node.files) {
        local.set(path, [...(local.get(path) ?? []), node])
      }
      walk(node.children)
    }
  }
  walk(plan.nodes)

  const globals = plan.globals.filter((path) => projectFiles.includes(path))

  return {
    local,
    globals,
    unassigned: projectFiles.filter((path) => !local.has(path) && !globals.includes(path))
  }
}

export interface PlanContext {
  /** Outermost first, ending with the node itself. */
  ancestry: PlanNode[]
  node: PlanNode
  role: PlanRole
  /** The sibling that follows, which is the direction the story is heading. */
  next: PlanNode | null
}

/**
 * Which part of the plan an ink file belongs to.
 *
 * The join used when writing ink, where the unit is a *file* rather than a
 * section. Scene files are app-managed one-to-one, so the owner should always
 * be the Scene; the deepest-owner rule keeps old data safe during migration.
 */
export function planContextForFile(plan: PlanDocument, filePath: string): PlanContext | null {
  if (filePath.length === 0) return null

  let best: PlanContext | null = null

  const find = (nodes: PlanNode[], trail: PlanNode[]): void => {
    for (const [index, node] of nodes.entries()) {
      const here = [...trail, node]
      if (node.files.includes(filePath) && here.length > (best?.ancestry.length ?? 0)) {
        best = {
          ancestry: here,
          node,
          role: roleAtDepth(trail.length),
          next: nodes[index + 1] ?? null
        }
      }
      find(node.children, here)
    }
  }

  find(plan.nodes, [])
  return best
}

/**
 * Where a knot sits in the plan.
 *
 * The join between plan and manuscript: a plan node's knot comes from its title
 * (or an override), a manuscript section's from the ink it was read from. When
 * nothing matches — hand-written ink, a renamed chapter — there is no context
 * rather than a guess.
 */
export function planContextForKnot(plan: PlanDocument, knot: string | null): PlanContext | null {
  if (!knot) return null

  const find = (nodes: PlanNode[], trail: PlanNode[]): PlanContext | null => {
    for (const [index, node] of nodes.entries()) {
      const here = [...trail, node]
      // A migrated Scene may intentionally share its title with the chapter
      // whose old file it took over. The Scene is the authored Ink context.
      const found = find(node.children, here)
      if (found) return found
      if (knotOf(node) === knot) {
        return { ancestry: here, node, role: roleAtDepth(trail.length), next: nodes[index + 1] ?? null }
      }
    }
    return null
  }

  return find(plan.nodes, [])
}

/**
 * The knots the story declares, in the shape the plan puts them in.
 *
 * A knot list scanned out of the ink is alphabetical and flat — forty
 * identifiers with nothing to say which part of the story they are. The plan
 * already knows: acts hold chapters hold Scenes, and a Scene owns a knot. So
 * anywhere a knot has to be *chosen*, this is the ordering worth offering,
 * because "the whole of chapter one" is a thing an author means and
 * `at_the_gate, the_hall, the_road` is not.
 *
 * Stitches ride with the knot that declares them, since `knot.stitch` belongs
 * to whatever `knot` belongs to and is never separately placed in the plan.
 * Anything the plan does not account for — hand-written ink, a global file, a
 * Scene renamed out from under its knot — lands in a group of its own rather
 * than being dropped: it is still somewhere the reader can be.
 */
export interface KnotGroup {
  /** A plan node's id, or `''` for the knots no plan node owns. */
  id: string
  title: string
  /** Acts hold chapters. Empty for a chapter, which holds knots directly. */
  groups: KnotGroup[]
  /** Knots owned here, in the order the plan puts their Scenes. */
  knots: string[]
}

export function planKnotGroups(plan: PlanDocument, sources: KnotSource[]): KnotGroup[] {
  const left = new Map(sources.map((one) => [one.knot, one]))

  /**
   * The knots a plan node accounts for.
   *
   * By *file* first, because that is what is actually true: a Scene owns one
   * ink file, and everything that file declares is that Scene's, whatever the
   * knots are called. Matching on the Scene's title-derived knot instead would
   * claim only the one knot that happens to share its name — a Scene called
   * "Forest encounter" whose file declares `chapter1_forest` and four more
   * would have every one of them reported as unplanned.
   *
   * By name second, for a node with no file of its own: an act or chapter
   * imported from markdown owns a knot by its title and nothing else. Stitches
   * come with it, since `knot.stitch` is declared wherever `knot` is.
   */
  const take = (node: PlanNode): string[] => {
    const own = knotOf(node)
    const mine = [...left.values()]
      .filter(
        (one) =>
          node.files.includes(one.file) ||
          (node.files.length === 0 && (one.knot === own || one.knot.startsWith(`${own}.`)))
      )
      .map((one) => one.knot)

    for (const knot of mine) left.delete(knot)
    return mine
  }

  const groups = plan.nodes.map((act) => ({
    id: act.id,
    title: act.title || 'Untitled act',
    groups: act.children.map((chapter) => ({
      id: chapter.id,
      title: chapter.title || 'Untitled chapter',
      groups: [],
      // A Scene may hold Scenes of its own; the plan allows any depth past a
      // chapter, and a knot buried in one still belongs to that chapter.
      knots: chapter.children.flatMap(function walk(scene: PlanNode): string[] {
        return [...take(scene), ...scene.children.flatMap(walk)]
      })
    })),
    // A chapter that never grew Scenes may still own a knot by its own title,
    // which is what a plan imported from markdown looks like.
    knots: take(act)
  }))

  // Empty groups are dropped rather than shown as headings with nothing under
  // them: an act with no ink yet is a row that can only be misread as broken.
  const pruned = groups
    .map((act) => ({ ...act, groups: act.groups.filter((one) => one.knots.length > 0) }))
    .filter((act) => act.groups.length > 0 || act.knots.length > 0)

  const rest = [...left.keys()]
  return rest.length > 0
    ? [...pruned, { id: '', title: 'Not in the plan', groups: [], knots: rest }]
    : pruned
}

/** Every knot in a group, including the ones its nested groups hold. */
export function knotsIn(group: KnotGroup): string[] {
  return [...group.knots, ...group.groups.flatMap(knotsIn)]
}
