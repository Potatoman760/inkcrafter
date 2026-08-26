/**
 * The outline: a plan for the story, kept as markdown beside it.
 *
 * Heading level is the hierarchy and the text beneath a heading is its summary,
 * the same shape novelcrafter uses — acts as large headings, chapters as
 * smaller ones, prose in between. It stays a plain markdown file, so it can be
 * written anywhere and read by anything.
 *
 * The parse exists to be generated from later: each node already carries the
 * ink knot name it would produce, and the view shows that before anything is
 * written, so the format can be trusted before a generator depends on it.
 */

/**
 * Depth, not heading level: an outline that starts at `##` still reads as acts
 * and chapters. A chapter with no children is its own scene, which is the usual
 * case in a visual novel where a chapter is often a single beat.
 */
export type OutlineRole = 'act' | 'chapter' | 'scene'

export type OutlineStatus = 'planned' | 'drafting' | 'done'

export const OUTLINE_STATUSES: readonly OutlineStatus[] = ['planned', 'drafting', 'done']

export interface OutlineNode {
  /** Positional, e.g. `1.2.1`. Stable while the outline above it is unchanged. */
  id: string
  /** Heading level, 1–6. Carried so a round trip re-emits it as written. */
  level: number
  role: OutlineRole
  title: string
  /** Text between this heading and the next, minus any field lines. Trimmed. */
  summary: string
  status: OutlineStatus | null
  tags: string[]
  /** The ink knot this node would become. */
  knot: string
  /** 1-based line of the heading, for jumping to it. */
  line: number
  children: OutlineNode[]
}

export interface Outline {
  /** Top-level nodes; deeper ones hang beneath them. */
  nodes: OutlineNode[]
  /** Anything before the first heading — a premise, or notes. */
  preamble: string
  headingCount: number
  /** Nodes with no children: the ones that would become knots with prose. */
  leafCount: number
  /**
   * Knot names claimed by more than one node. Two chapters both called
   * "Escape" collide when generated, and it is worth knowing before then.
   */
  duplicateKnots: string[]
}

// The text is optional: `#` alone is a valid empty heading, while `#hashtag`
// is not a heading at all, since the marker must be followed by space or nothing.
const HEADING = /^(#{1,6})(?:\s+(.*))?$/
const FENCE = /^\s*(?:```|~~~)/

/**
 * Only these keys are fields, and only at the top of a heading's body.
 * Anything else is prose, so a summary beginning "Note: ..." stays a summary
 * rather than becoming a mangled field.
 */
const FIELD = /^(status|tags):[ \t]*(.*)$/i

interface Fields {
  status: OutlineStatus | null
  tags: string[]
  /** The body with the recognised field lines removed. */
  rest: string[]
}

function takeFields(body: string[]): Fields {
  let status: OutlineStatus | null = null
  let tags: string[] = []
  let index = 0

  for (; index < body.length; index++) {
    const line = body[index]!
    // Blank lines before the first field are skipped; a blank line after them
    // ends the block, so prose is never scanned for keys.
    if (line.trim().length === 0 && status === null && tags.length === 0) continue

    const match = FIELD.exec(line.trim())
    if (!match) break

    const value = match[2]!.trim()
    if (match[1]!.toLowerCase() === 'status') {
      const candidate = value.toLowerCase() as OutlineStatus
      status = OUTLINE_STATUSES.includes(candidate) ? candidate : null
    } else {
      tags = value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    }
  }

  return { status, tags, rest: body.slice(index) }
}

function roleForDepth(depth: number): OutlineRole {
  if (depth === 0) return 'act'
  return depth === 1 ? 'chapter' : 'scene'
}

/**
 * Turns a heading into a legal ink knot name: letters, digits and underscores,
 * never starting with a digit.
 */
export function inkIdentifier(title: string): string {
  const cleaned = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (cleaned.length === 0) return 'section'
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

interface FlatHeading {
  level: number
  title: string
  line: number
  body: string[]
}

export function parseOutline(markdown: string): Outline {
  const lines = markdown.split(/\r?\n/)
  const headings: FlatHeading[] = []
  const preamble: string[] = []
  let fenced = false

  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) {
      fenced = !fenced
      // A fence still belongs to whatever body it sits in.
      ;(headings[headings.length - 1]?.body ?? preamble).push(line)
      continue
    }

    // A `#` inside a code block is code, not a heading.
    const match = fenced ? null : HEADING.exec(line)
    if (match) {
      headings.push({
        level: match[1]!.length,
        title: (match[2] ?? '').trim(),
        line: index + 1,
        body: []
      })
      continue
    }

    ;(headings[headings.length - 1]?.body ?? preamble).push(line)
  }

  // Build the tree by heading level. A jump from h1 straight to h3 nests under
  // whatever is open rather than being discarded, because authors do that.
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  const counters: number[] = []

  for (const heading of headings) {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) {
      stack.pop()
    }

    // Counters are truncated to the new depth, not popped alongside the stack:
    // popping would discard the count of the siblings just closed, and the next
    // sibling would repeat its predecessor's number.
    const depth = stack.length
    counters.length = depth + 1
    counters[depth] = (counters[depth] ?? 0) + 1

    const fields = takeFields(heading.body)

    const node: OutlineNode = {
      id: counters.join('.'),
      level: heading.level,
      role: roleForDepth(depth),
      title: heading.title,
      summary: fields.rest.join('\n').trim(),
      status: fields.status,
      tags: fields.tags,
      knot: inkIdentifier(heading.title),
      line: heading.line,
      children: []
    }

    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1]!.children.push(node)

    stack.push(node)
  }

  const all: OutlineNode[] = []
  const walk = (nodes: OutlineNode[]): void => {
    for (const node of nodes) {
      all.push(node)
      walk(node.children)
    }
  }
  walk(roots)

  const seen = new Map<string, number>()
  for (const node of all) seen.set(node.knot, (seen.get(node.knot) ?? 0) + 1)

  return {
    nodes: roots,
    preamble: preamble.join('\n').trim(),
    headingCount: all.length,
    leafCount: all.filter((node) => node.children.length === 0).length,
    duplicateKnots: [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([knot]) => knot)
      .sort()
  }
}

/** Every node, depth-first, for callers that want a flat list. */
export function flattenOutline(outline: Outline): OutlineNode[] {
  const flat: OutlineNode[] = []
  const walk = (nodes: OutlineNode[]): void => {
    for (const node of nodes) {
      flat.push(node)
      walk(node.children)
    }
  }
  walk(outline.nodes)
  return flat
}

/** Offered when the outline is empty, so the format is obvious from the start. */
export const OUTLINE_TEMPLATE = `Notes on the story go here, above the first heading.

# Act One

The situation, and what disturbs it.

## The door

She arrives at the archive after hours and finds the door shut.

## Inside

What she finds on the shelves, and who finds her.

# Act Two

The complication.

## The ledger

The page she was not meant to see.

# Act Three

How it resolves — and how differently it can resolve.

## The way out
`
