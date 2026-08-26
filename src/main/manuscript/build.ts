import { relative, sep } from 'node:path'
import type { Story } from 'inkjs/engine/Story'
import { Path } from 'inkjs/engine/Path'
import { StringValue } from 'inkjs/engine/Value'
import type { InkObject } from 'inkjs/engine/Object'
import type { DebugMetadata } from 'inkjs/engine/DebugMetadata'
import type {
  EndingNode,
  JunctionNode,
  ManuscriptChoice,
  ManuscriptNode,
  ProseNode,
  SourceAnchor
} from '@shared/manuscript'
import { editabilityOf, SourceCache } from './edit'

/**
 * A stretch between two junctions is bounded by the author choosing, but a
 * single stretch can still diverge: `-> knot` cycles with no choice in them are
 * ordinary ink. This runs in the main process, so an unbounded loop takes the
 * whole app down rather than just wedging a view.
 */
const MAX_CONTINUES_PER_ADVANCE = 5_000

export interface AdvanceResult {
  nodes: ManuscriptNode[]
  /** True when the story stopped at a junction rather than finishing. */
  atJunction: boolean
}

/**
 * Turns an absolute or include-relative filename from debug metadata into
 * something the renderer can act on.
 *
 * `DebugMetadata.fileName` is whatever the compiler was handed — the entry
 * point's full path for the root file, and the raw `INCLUDE` argument for the
 * rest — so both shapes have to be normalised against the project.
 */
function toProjectRelative(fileName: string | null, projectPath: string, rootDir: string): string | null {
  if (!fileName) return null

  const absolute = fileName.includes(':') || fileName.startsWith(sep) || fileName.startsWith('/')
  const resolved = absolute ? fileName : `${rootDir}${sep}${fileName}`
  const inside = relative(projectPath, resolved)

  if (inside.startsWith('..')) return fileName
  return inside.split(sep).join('/')
}

function anchorOf(
  object: InkObject | null,
  projectPath: string,
  rootDir: string
): SourceAnchor | null {
  const metadata = object?.debugMetadata
  if (!metadata) return null

  const file = toProjectRelative(metadata.fileName, projectPath, rootDir)
  if (!file) return null

  return { file, line: metadata.startLineNumber }
}

/** `the_door.0.c-0` → `the_door`. */
function knotFromPath(path: string | null): string | null {
  const head = path?.split('.')[0]
  return head && /^[A-Za-z_]\w*$/.test(head) ? head : null
}

interface ParagraphOrigin {
  anchor: SourceAnchor | null
  knot: string | null
}

/**
 * Where the paragraph just emitted came from.
 *
 * `Continue()` assembles a paragraph from every object pushed to the output
 * stream, so the first text fragment is the line the author would expect to land
 * on — the same route the compiler's own `RetrieveDebugSourceForLatestContent`
 * takes. Reading the knot off that object rather than off the story pointer
 * matters because by this point the pointer has already moved on, and at the end
 * of a knot it is null.
 *
 * Text assembled at runtime — `{interpolation}`, a function's return value — is
 * a fresh value with no metadata and no place in the content tree, so it falls
 * back to where the story currently is, which is the call site. That is the
 * right answer for a reader: the call site is where the line appears.
 */
function paragraphOrigin(
  story: Story,
  projectPath: string,
  rootDir: string,
  fallback: DebugMetadata | null
): ParagraphOrigin {
  for (const output of story.state.outputStream) {
    if (!(output instanceof StringValue)) continue
    if (typeof output.value === 'string' && output.value.trim().length === 0) continue

    const anchor = anchorOf(output, projectPath, rootDir)
    let knot: string | null = null
    try {
      knot = knotFromPath(output.path?.toString() ?? null)
    } catch {
      // A runtime-built value has no parent, so no path.
    }

    if (anchor || knot) return { anchor, knot }
  }

  // Nothing in the output stream could place itself, so fall back to where the
  // story was standing when this paragraph was read — captured before
  // `Continue()`, because by now the pointer has moved past it and is often null.
  const file = fallback ? toProjectRelative(fallback.fileName, projectPath, rootDir) : null

  return {
    anchor: file && fallback ? { file, line: fallback.startLineNumber } : null,
    knot: knotFromPath(story.state.currentPathString ?? story.state.previousPathString)
  }
}

/**
 * The source line a choice was written on.
 *
 * A runtime `Choice` cannot answer this itself: `Story.ProcessChoice` builds a
 * bare `new Choice()` and copies across text, paths and tags but never the
 * originating choice point's debug metadata. The type permits it — `Choice`
 * extends `InkObject` — but it is always null in practice.
 *
 * What survives is `sourcePath`, which addresses the `ChoicePoint` in the
 * content tree, and *that* object does carry metadata from the compiler.
 */
function choiceAnchor(
  story: Story,
  sourcePath: string,
  projectPath: string,
  rootDir: string
): SourceAnchor | null {
  if (!sourcePath) return null
  try {
    const found = story.ContentAtPath(new Path(sourcePath))
    return anchorOf(found.correctObj ?? found.obj, projectPath, rootDir)
  } catch {
    return null
  }
}

function choicesOf(
  story: Story,
  projectPath: string,
  rootDir: string,
  sources: SourceCache
): ManuscriptChoice[] {
  return story.currentChoices.map((choice) => {
    const source = choiceAnchor(story, choice.sourcePath, projectPath, rootDir)
    return {
      index: choice.index,
      text: choice.text,
      tags: choice.tags ?? [],
      source,
      edit: editabilityOf(sources.lineAt(source), choice.text)
    }
  })
}

function ending(id: string, reason: EndingNode['reason'], message: string | null): EndingNode {
  return { kind: 'ending', id, reason, message }
}

/**
 * Runs the story forward until it needs a choice, or ends.
 *
 * `nextId` supplies node ids; the caller owns the counter so ids stay unique
 * across the whole manuscript rather than restarting each advance.
 */
export function advance(
  story: Story,
  projectPath: string,
  rootDir: string,
  nextId: () => string,
  sources: SourceCache
): AdvanceResult {
  const nodes: ManuscriptNode[] = []
  let steps = 0

  try {
    while (story.canContinue) {
      if (++steps > MAX_CONTINUES_PER_ADVANCE) {
        nodes.push(
          ending(
            nextId(),
            'loop',
            `Stopped after ${MAX_CONTINUES_PER_ADVANCE} lines without reaching a choice or an ending. The story is probably diverting in a cycle.`
          )
        )
        return { nodes, atJunction: false }
      }

      // Where the story stands before reading, which is the only moment the
      // pointer is guaranteed to be on the content about to be emitted.
      const before = story.currentDebugMetadata

      const text = (story.Continue() ?? '').trim()
      const tags = story.currentTags ?? []
      if (text.length === 0 && tags.length === 0) continue

      const origin = paragraphOrigin(story, projectPath, rootDir, before)
      const prose: ProseNode = {
        kind: 'prose',
        id: nextId(),
        text,
        tags,
        knot: origin.knot,
        source: origin.anchor,
        edit: editabilityOf(sources.lineAt(origin.anchor), text)
      }
      nodes.push(prose)
    }
  } catch (error) {
    nodes.push(ending(nextId(), 'error', error instanceof Error ? error.message : String(error)))
    return { nodes, atJunction: false }
  }

  const runtimeErrors = story.currentErrors ?? []
  if (runtimeErrors.length > 0) {
    nodes.push(ending(nextId(), 'error', runtimeErrors.join('\n')))
    return { nodes, atJunction: false }
  }

  if (story.currentChoices.length === 0) {
    nodes.push(ending(nextId(), 'end', null))
    return { nodes, atJunction: false }
  }

  const junction: JunctionNode = {
    kind: 'junction',
    id: nextId(),
    choices: choicesOf(story, projectPath, rootDir, sources),
    chosenIndex: null,
    source: choiceAnchor(
      story,
      story.currentChoices[0]?.sourcePath ?? '',
      projectPath,
      rootDir
    )
  }
  nodes.push(junction)

  return { nodes, atJunction: true }
}

export function countWords(nodes: ManuscriptNode[]): number {
  return nodes.reduce((total, node) => {
    if (node.kind !== 'prose') return total
    const words = node.text.split(/\s+/).filter(Boolean).length
    return total + words
  }, 0)
}
