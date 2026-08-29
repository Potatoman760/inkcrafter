import { newId } from './ids'
import { inkIdentifier, parseOutline, type OutlineNode } from './outline'

/**
 * The plan: the story's structure, as the app's own document.
 *
 * JSON rather than markdown. Only the ink is a format anyone else needs to
 * read, and holding the plan as markdown cost more than it returned: node
 * identity had to be positional, so an id shifted whenever anything above it
 * moved; fields competed with prose, so a summary beginning "Note:" was
 * ambiguous; and every save round-tripped through a parser that had to
 * reproduce the file faithfully.
 *
 * Markdown survives as an *import*, which is the part that was actually useful —
 * an outline drafted elsewhere, or a structure template, pastes straight in.
 */

export type PlanStatus = 'planned' | 'drafting' | 'done'

export const PLAN_STATUSES: readonly PlanStatus[] = ['planned', 'drafting', 'done']

/** Depth, not a stored field: acts hold chapters hold scenes. */
export type PlanRole = 'act' | 'chapter' | 'scene'

export interface PlanNode {
  /** `pln_…`. Generated once and stable however the plan is rearranged. */
  id: string
  title: string
  summary: string
  status: PlanStatus | null
  tags: string[]
  /** Overrides a Scene's title-derived knot. Kept on containers for v1 compatibility. */
  knot: string | null
  /** A Chapter's project-relative folder. New Scene Ink files are created here. */
  folder: string | null
  /** A Scene's single app-managed Ink file. Empty for acts and chapters. */
  files: string[]
  children: PlanNode[]
}

export interface PlanDocument {
  version: 1
  /** Anything that belongs to the story as a whole rather than a section. */
  notes: string
  /**
   * Ink files belonging to the story rather than to any one section — an
   * overworld map, shared functions, global variables. Marked deliberately, so
   * that a file nobody has placed yet stays visible as unassigned rather than
   * quietly passing for global.
   */
  globals: string[]
  nodes: PlanNode[]
}

export function emptyPlan(): PlanDocument {
  return { version: 1, notes: '', globals: [], nodes: [] }
}

export function newPlanNode(title: string): PlanNode {
  return {
    id: newId('pln'),
    title,
    summary: '',
    status: null,
    tags: [],
    knot: null,
    folder: null,
    files: [],
    children: []
  }
}

/** The ink knot this node would become. */
export function knotOf(node: PlanNode): string {
  return node.knot ?? inkIdentifier(node.title)
}

export function roleAtDepth(depth: number): PlanRole {
  if (depth === 0) return 'act'
  return depth === 1 ? 'chapter' : 'scene'
}

export function flattenPlan(plan: PlanDocument): PlanNode[] {
  const flat: PlanNode[] = []
  const walk = (nodes: PlanNode[]): void => {
    for (const node of nodes) {
      flat.push(node)
      walk(node.children)
    }
  }
  walk(plan.nodes)
  return flat
}

/** Knot names claimed twice, which would collide when generated into ink. */
export function duplicateKnots(plan: PlanDocument): string[] {
  const seen = new Map<string, number>()
  // Only scenes become authored Ink now. Acts and chapters are planning
  // containers, so sharing a title with the scene migrated from their old
  // chapter-level file is not an Ink collision.
  const walk = (nodes: PlanNode[], depth: number): void => {
    for (const node of nodes) {
      if (depth >= 2) {
        const knot = knotOf(node)
        seen.set(knot, (seen.get(knot) ?? 0) + 1)
      }
      walk(node.children, depth + 1)
    }
  }
  walk(plan.nodes, 0)
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([knot]) => knot)
    .sort()
}

export function findPlanNode(plan: PlanDocument, id: string): PlanNode | null {
  return flattenPlan(plan).find((node) => node.id === id) ?? null
}

// --- Tree operations -------------------------------------------------------
// Children are a field on a node, so an edit cannot reach them. Ids are stable,
// so nothing has to be renumbered afterwards.

export interface PlanChanges {
  title?: string
  summary?: string
  status?: PlanStatus | null
  tags?: string[]
  knot?: string | null
  folder?: string | null
  files?: string[]
}

function mapNodes(nodes: PlanNode[], id: string, change: (node: PlanNode) => PlanNode): PlanNode[] {
  return nodes.map((node) =>
    node.id === id ? change(node) : { ...node, children: mapNodes(node.children, id, change) }
  )
}

export function updatePlanNode(plan: PlanDocument, id: string, changes: PlanChanges): PlanDocument {
  return { ...plan, nodes: mapNodes(plan.nodes, id, (node) => ({ ...node, ...changes })) }
}

export function insertPlanNode(
  plan: PlanDocument,
  parentId: string | null,
  title: string,
  afterId?: string
): { plan: PlanDocument; node: PlanNode } {
  const node = newPlanNode(title)

  const place = (siblings: PlanNode[]): PlanNode[] => {
    const at = afterId ? siblings.findIndex((sibling) => sibling.id === afterId) : -1
    return at === -1
      ? [...siblings, node]
      : [...siblings.slice(0, at + 1), node, ...siblings.slice(at + 1)]
  }

  if (parentId === null) return { plan: { ...plan, nodes: place(plan.nodes) }, node }

  return {
    plan: {
      ...plan,
      nodes: mapNodes(plan.nodes, parentId, (parent) => ({
        ...parent,
        children: place(parent.children)
      }))
    },
    node
  }
}

/**
 * Moves legacy chapter attachments down into Scenes.
 *
 * Older plans let every level own any number of Ink files. The editor now
 * treats acts and chapters as structure and every Scene as exactly one file.
 * Existing paths are preserved byte-for-byte; this only changes plan.json.
 */
export function migratePlanScenes(plan: PlanDocument): PlanDocument {
  const globals = new Set(plan.globals)

  const acts = plan.nodes.map((act) => {
    for (const file of act.files) globals.add(file)

    const chapters = act.children.map((chapter) => {
      const inherited = [...new Set(chapter.files)]
      const children: PlanNode[] = []

      for (const child of chapter.children) {
        const own = [...new Set(child.files)]
        const first = own.shift() ?? inherited.shift() ?? null
        if (first) {
          const duplicate = inherited.indexOf(first)
          if (duplicate !== -1) inherited.splice(duplicate, 1)
        }
        children.push({ ...child, files: first ? [first] : [], children: [] })

        for (const extra of own) {
          children.push({ ...newPlanNode(titleFromFile(extra)), files: [extra] })
        }
      }

      for (const file of inherited) {
        // A chapter with one old file was already functioning as one scene.
        // Copy its planning prose so the new Scene is useful immediately while
        // retaining the chapter's overall description.
        const onlyScene = children.length === 0 && inherited.length === 1
        children.push({
          ...newPlanNode(onlyScene ? chapter.title : titleFromFile(file)),
          summary: onlyScene ? chapter.summary : '',
          status: onlyScene ? chapter.status : null,
          tags: onlyScene ? chapter.tags : [],
          knot: onlyScene ? chapter.knot : null,
          files: [file]
        })
      }

      return { ...chapter, files: [], children }
    })

    return { ...act, files: [], children: chapters }
  })

  return { ...plan, globals: [...globals], nodes: acts }
}

function titleFromFile(path: string): string {
  const base = path.split('/').pop()?.replace(/\.ink$/i, '') ?? 'Scene'
  const spaced = base
    .replace(/([a-z])([0-9])/gi, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
  return spaced.length > 0
    ? spaced.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Scene'
}

function drop(nodes: PlanNode[], id: string): PlanNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: drop(node.children, id) }))
}

/** Removes a node and, necessarily, everything beneath it. */
export function removePlanNode(plan: PlanDocument, id: string): PlanDocument {
  return { ...plan, nodes: drop(plan.nodes, id) }
}

/**
 * Moves a node under a new parent. Trivial now that identity does not depend on
 * position: lift it out, put it back somewhere else.
 */
export function movePlanNode(
  plan: PlanDocument,
  id: string,
  parentId: string | null,
  /** `null` means first; omitted means last. */
  afterId?: string | null
): PlanDocument {
  const node = findPlanNode(plan, id)
  if (!node) return plan
  // Moving a node into its own descendant would detach the whole branch.
  if (parentId !== null && flattenPlan({ ...plan, nodes: node.children }).some((child) => child.id === parentId)) {
    return plan
  }

  const without = removePlanNode(plan, id)

  const place = (siblings: PlanNode[]): PlanNode[] => {
    if (afterId === null) return [node, ...siblings]
    const at = afterId ? siblings.findIndex((sibling) => sibling.id === afterId) : -1
    return at === -1
      ? [...siblings, node]
      : [...siblings.slice(0, at + 1), node, ...siblings.slice(at + 1)]
  }

  if (parentId === null) return { ...without, nodes: place(without.nodes) }

  return {
    ...without,
    nodes: mapNodes(without.nodes, parentId, (parent) => ({
      ...parent,
      children: place(parent.children)
    }))
  }
}

// --- Ink files -------------------------------------------------------------

/**
 * Attaches a file to a section. A file cannot be both local and global, so
 * attaching removes it from the global list.
 */
export function attachFile(plan: PlanDocument, nodeId: string, path: string): PlanDocument {
  return {
    ...plan,
    globals: plan.globals.filter((candidate) => candidate !== path),
    nodes: mapNodes(plan.nodes, nodeId, (node) => ({
      ...node,
      files: node.files.includes(path) ? node.files : [...node.files, path]
    }))
  }
}

export function detachFile(plan: PlanDocument, nodeId: string, path: string): PlanDocument {
  return {
    ...plan,
    nodes: mapNodes(plan.nodes, nodeId, (node) => ({
      ...node,
      files: node.files.filter((candidate) => candidate !== path)
    }))
  }
}

/** Marks a file as belonging to the story rather than a section, or unmarks it. */
export function setGlobalFile(plan: PlanDocument, path: string, global: boolean): PlanDocument {
  if (!global) {
    return { ...plan, globals: plan.globals.filter((candidate) => candidate !== path) }
  }

  return {
    ...plan,
    globals: plan.globals.includes(path) ? plan.globals : [...plan.globals, path],
    nodes: stripFile(plan.nodes, path)
  }
}

function stripFile(nodes: PlanNode[], path: string): PlanNode[] {
  return nodes.map((node) => ({
    ...node,
    files: node.files.filter((candidate) => candidate !== path),
    children: stripFile(node.children, path)
  }))
}

/** Drops a file from wherever it was placed, for when it leaves the project. */
export function forgetFile(plan: PlanDocument, path: string): PlanDocument {
  return {
    ...plan,
    globals: plan.globals.filter((candidate) => candidate !== path),
    nodes: stripFile(plan.nodes, path)
  }
}

// --- Import and export -----------------------------------------------------

function fromOutlineNode(node: OutlineNode): PlanNode {
  return {
    id: newId('pln'),
    title: node.title,
    summary: node.summary,
    status: node.status,
    tags: node.tags,
    knot: null,
    folder: null,
    files: [],
    children: node.children.map(fromOutlineNode)
  }
}

/**
 * Builds a plan from a markdown outline — heading level for hierarchy, the text
 * beneath as the summary. This is how an outline drafted elsewhere gets in.
 */
export function planFromMarkdown(markdown: string): PlanDocument {
  const outline = parseOutline(markdown)
  return {
    version: 1,
    notes: outline.preamble,
    globals: [],
    nodes: outline.nodes.map(fromOutlineNode)
  }
}

/** The plan as markdown, for pasting somewhere that wants prose. */
export function planToMarkdown(plan: PlanDocument): string {
  const out: string[] = []

  const notes = plan.notes.trim()
  if (notes.length > 0) out.push(notes, '')

  const walk = (nodes: PlanNode[], depth: number): void => {
    for (const node of nodes) {
      out.push(`${'#'.repeat(Math.min(depth + 1, 6))} ${node.title}`.trimEnd())
      if (node.status) out.push(`status: ${node.status}`)
      if (node.tags.length > 0) out.push(`tags: ${node.tags.join(', ')}`)

      const summary = node.summary.trim()
      if (summary.length > 0) out.push('', ...summary.split('\n'))
      out.push('')
      walk(node.children, depth + 1)
    }
  }
  walk(plan.nodes, 0)

  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out.length === 0 ? '' : `${out.join('\n')}\n`
}

// --- Reading what is on disk -----------------------------------------------

function asStatus(value: unknown): PlanStatus | null {
  return PLAN_STATUSES.includes(value as PlanStatus) ? (value as PlanStatus) : null
}

function asPaths(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((path): path is string => typeof path === 'string' && path.length > 0)
    : []
}

function asNode(value: unknown): PlanNode | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  return {
    // A hand-edited file may be missing ids; minting one keeps it usable.
    id: typeof record['id'] === 'string' && record['id'].length > 0 ? record['id'] : newId('pln'),
    title: typeof record['title'] === 'string' ? record['title'] : '',
    summary: typeof record['summary'] === 'string' ? record['summary'] : '',
    status: asStatus(record['status']),
    tags: Array.isArray(record['tags'])
      ? record['tags'].filter((tag): tag is string => typeof tag === 'string')
      : [],
    knot: typeof record['knot'] === 'string' && record['knot'].length > 0 ? record['knot'] : null,
    folder: typeof record['folder'] === 'string' && record['folder'].length > 0
      ? record['folder']
      : null,
    files: asPaths(record['files']),
    children: Array.isArray(record['children'])
      ? record['children'].map(asNode).filter((child): child is PlanNode => child !== null)
      : []
  }
}

/**
 * Parses a plan file, tolerating anything. A malformed plan yields an empty one
 * rather than throwing — the same principle as the settings and codex readers.
 */
export function parsePlan(json: string): PlanDocument {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyPlan()
    const record = parsed as Record<string, unknown>

    return {
      version: 1,
      notes: typeof record['notes'] === 'string' ? record['notes'] : '',
      globals: asPaths(record['globals']),
      nodes: Array.isArray(record['nodes'])
        ? record['nodes'].map(asNode).filter((node): node is PlanNode => node !== null)
        : []
    }
  } catch {
    return emptyPlan()
  }
}

export function serialisePlan(plan: PlanDocument): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}
