/**
 * The manuscript: a branching story read as one continuous novel.
 *
 * An ink file is a program, and the story it tells only exists in reading order
 * at runtime. The manuscript is that reading order made visible — a single path
 * from beginning to end, with every junction shown in place and changeable.
 *
 * It is a projection of the ink rather than a document of its own. The ink file
 * remains the single save format: the manuscript and the editor are two windows
 * onto the same text, and either can write to it.
 */

/** Where a piece of the manuscript came from in the source. */
export interface SourceAnchor {
  /** Project-relative path, e.g. `ink/main.ink`. */
  file: string
  /** 1-based. */
  line: number
}

/**
 * Whether a rendered line can be written back to the ink that produced it.
 *
 * It can when the rendered text appears verbatim in its source line exactly
 * once — proof the mapping is one-to-one and a replacement cannot touch anything
 * else. It cannot when the runtime transformed the text on its way out: a
 * conditional picked one of several branches, an interpolation substituted a
 * value, a function returned a string that exists nowhere in the file. Those are
 * shown read-only with the reason, rather than silently mangled.
 */
export interface Editability {
  editable: boolean
  /** Why not, when not. Null when editable. */
  reason: string | null
}

export const EDITABLE: Editability = { editable: true, reason: null }

export interface ManuscriptChoice {
  /** Index into the runtime's current choice list. Only valid at this junction. */
  index: number
  text: string
  tags: string[]
  source: SourceAnchor | null
  edit: Editability
}

export interface ProseNode {
  kind: 'prose'
  id: string
  text: string
  tags: string[]
  /** Knot or stitch the line came from, for orientation in a long read. */
  knot: string | null
  source: SourceAnchor | null
  edit: Editability
}

export interface JunctionNode {
  kind: 'junction'
  id: string
  choices: ManuscriptChoice[]
  /**
   * Null while the junction is awaiting a choice. Only the last node in a
   * manuscript can be in that state — everything before it is decided, by
   * construction, because choosing is what extends the manuscript.
   */
  chosenIndex: number | null
  source: SourceAnchor | null
}

export interface EndingNode {
  kind: 'ending'
  id: string
  reason: 'end' | 'loop' | 'error'
  message: string | null
}

export type ManuscriptNode = ProseNode | JunctionNode | EndingNode

/**
 * One recorded decision. Stored against the choice point's source path rather
 * than its ordinal, so a path can be replayed against an edited story: steps
 * apply while their junction still matches, and reading resumes by hand from the
 * first that does not.
 */
export interface PathStep {
  sourcePath: string
  choiceIndex: number
  choiceText: string
}

export interface Manuscript {
  /** Absolute path of the entry point this was read from. */
  entryPath: string
  /** Project-relative entry path, for display. */
  entryLabel: string
  nodes: ManuscriptNode[]
  path: PathStep[]
  wordCount: number
  /** True once the path reaches an ending; false while a junction is open. */
  complete: boolean
  /** Compiler problems. A story that does not compile has no manuscript. */
  diagnostics: string[]
}

export function emptyManuscript(entryPath: string, entryLabel: string): Manuscript {
  return {
    entryPath,
    entryLabel,
    nodes: [],
    path: [],
    wordCount: 0,
    complete: false,
    diagnostics: []
  }
}

/**
 * A run of prose between two choices — the unit the AI writes, and the closest
 * thing the manuscript has to a scene.
 *
 * Empty sections are kept so that indices are purely positional and mean the
 * same thing on both sides of the IPC boundary.
 */
export interface Section {
  index: number
  nodes: ProseNode[]
  /** The junction that led here, or null for the opening. */
  afterJunctionId: string | null
}

export function sectionsOf(manuscript: Manuscript): Section[] {
  const sections: Section[] = []
  let nodes: ProseNode[] = []
  let afterJunctionId: string | null = null

  for (const node of manuscript.nodes) {
    if (node.kind === 'prose') {
      nodes.push(node)
      continue
    }
    if (node.kind === 'junction') {
      sections.push({ index: sections.length, nodes, afterJunctionId })
      nodes = []
      afterJunctionId = node.id
    }
  }

  sections.push({ index: sections.length, nodes, afterJunctionId })
  return sections
}

/** The junction awaiting a choice, if the manuscript is stopped at one. */
export function openJunction(manuscript: Manuscript): JunctionNode | null {
  const last = manuscript.nodes[manuscript.nodes.length - 1]
  return last?.kind === 'junction' && last.chosenIndex === null ? last : null
}