import { formatTag, type TagCommand } from '@shared/bundle/tagSpec'
import { scanTags } from '@shared/inkTags'
import type { ProseNode } from '@shared/manuscript'

/**
 * Finding where a section's `#` lines actually are.
 *
 * The manuscript knows *what* a section's tags say — every `ProseNode` carries
 * `tags` — but not which line each one sits on, and that is the one thing a rail
 * that edits them needs. Worse, the tags that matter most are usually outside
 * the section's own span:
 *
 *     === seedblossom ===       10
 *     #bg: grove                11   <- above the span
 *     #char: seraphine at left  12   <- above the span
 *     You have arrived.         13   <- first anchored node
 *
 * A section's span is the min-to-max hull over its anchored nodes, exactly as
 * `canReplaceSection` computes it, so it begins at 13. The tag block above it is
 * found by walking upward over lines that could only be part of it — blank,
 * comment, or nothing but a tag — and stopping at the first line that is
 * anything else. The knot header stops the walk, which is what keeps one
 * section's tags from being read as the previous section's.
 */

/** One tag, and enough to rewrite or remove it. */
export interface LocatedTag {
  /** The tag as written, without the `#`. */
  raw: string
  command: TagCommand | null
  /** 1-based. */
  line: number
  /** Within the line: `from` on the `#`, `to` past the tag's last character. */
  from: number
  to: number
}

export interface TagBlock {
  /** The file the section lives in, or null when there is nowhere to write. */
  file: string | null
  /**
   * The line number a new tag should become — insert it *at* this line, pushing
   * the rest down. Null when there is nowhere to write.
   */
  insertAt: number | null
  /** Every tag belonging to this section, in source order. */
  tags: LocatedTag[]
  /** Why there is nowhere to write, when there is not. */
  reason: string | null
}

const NOWHERE = { file: null, insertAt: null, tags: [] }

/**
 * Whether a line could be part of the tag block above a section.
 *
 * Deliberately narrow. A line with prose on it and a tag at the end belongs to
 * the section it is in, not to the block above — so only a line that is *purely*
 * a tag, a comment, or nothing at all extends the walk upward.
 */
function isBlockLine(line: string): boolean {
  const body = line.trim()
  return body.length === 0 || body.startsWith('//') || body.startsWith('#')
}

/**
 * The tags belonging to one section, and where a new one would go.
 *
 * Refuses in the same two cases `canReplaceSection` refuses, and for the same
 * reasons: a section assembled entirely at runtime has no line to attach to, and
 * one spread across two files has no single place that means "the top".
 */
export function sectionTagBlock(
  nodes: ProseNode[],
  linesOf: (file: string) => string[] | null
): TagBlock {
  const anchored = nodes.filter((node) => node.source !== null)
  if (anchored.length === 0) {
    return {
      ...NOWHERE,
      reason:
        'This section has no line in the source to attach to. Write the first line in the ink, then stage it from there.'
    }
  }

  const files = new Set(anchored.map((node) => node.source!.file))
  if (files.size > 1) {
    return {
      ...NOWHERE,
      reason: 'This section is spread across more than one file, so it has no single place to stage.'
    }
  }

  const file = [...files][0]!
  const lines = linesOf(file)
  if (!lines) return { ...NOWHERE, reason: 'The source file could not be read.' }

  const numbers = anchored.map((node) => node.source!.line)
  const from = Math.min(...numbers)
  const to = Math.max(...numbers)

  // Upward over the block, stopping at the first line that is something else.
  let leadFrom = from
  while (leadFrom > 1 && isBlockLine(lines[leadFrom - 2] ?? '')) leadFrom--

  // Downward over the same run, which says both where a new tag goes and — the
  // part that matters more — how far the block actually reaches.
  //
  // Walked rather than inferred from `from`, because `from` is not reliably
  // below the tags: ink hands a chunk its tags on the way in, so a paragraph
  // preceded by staging is usually anchored to the *first* of those tag lines
  // rather than to the prose. Bounding the block at `from` therefore found the
  // first tag of a knot and none of the rest, and changing the second character
  // appended a line contradicting the one already there.
  //
  // The walk cannot escape into the next knot: a `===` header is not a block
  // line, so it ends the run exactly as prose does.
  let blockEnd = leadFrom - 1
  let lastTag = 0
  for (let line = leadFrom; line <= lines.length && isBlockLine(lines[line - 1] ?? ''); line++) {
    blockEnd = line
    if ((lines[line - 1] ?? '').trim().startsWith('#')) lastTag = line
  }

  // Scanned over the whole file rather than the slice: `scanTags` tracks block
  // comments across lines, and a `/*` opened above the block would otherwise be
  // invisible to it and its contents read as tags.
  const end = Math.max(to, blockEnd)
  const tags = scanTags(lines.join('\n')).filter((use) => use.line >= leadFrom && use.line <= end)

  return { file, insertAt: lastTag === 0 ? leadFrom : lastTag + 1, tags, reason: null }
}

/**
 * Which existing tag a new one should replace, or -1 to add it.
 *
 * Not simply "the same kind". A background is one thing, so setting it replaces
 * whatever was there; a character is one of several, so setting Wren's look must
 * leave Kael alone. The subject is what the two tags are *about*.
 */
export function replaces(tags: LocatedTag[], command: TagCommand): number {
  return tags.findIndex((one) => one.command !== null && sameSubject(one.command, command))
}

function sameSubject(a: TagCommand, b: TagCommand): boolean {
  // `clear` speaks for the whole stage, so it never replaces anything and
  // nothing replaces it — an author who asked to clear the stage asked for one
  // edit, not for their `# show:` lines to be deleted as well.
  if (a.kind === 'clear' || b.kind === 'clear') return false

  // `show` and `hide` are the same subject seen twice: showing someone already
  // hidden should replace the tag that hid them rather than sit below it and
  // contradict it.
  const character = (one: TagCommand): string | null =>
    one.kind === 'show' || one.kind === 'hide' ? one.name : null

  const left = character(a)
  if (left !== null) return left === character(b)

  if (a.kind !== b.kind) return false

  if (a.kind === 'stat' && b.kind === 'stat') return a.stat === b.stat
  if (a.kind === 'npc' && b.kind === 'npc') return a.id === b.id && a.attr === b.attr

  // Everything left is single-valued: bg, music, speaker, active, map,
  // and the one autosave checkpoint a section may declare.
  return true
}

/**
 * Whether the tag is still exactly where it was read from.
 *
 * The `SourceCache` is filled when the manuscript is built, and the file can
 * change after that — the editor holds the same ink in another pane, and the
 * author may have saved it. Rewriting by a stale span would drop a tag into the
 * middle of a sentence, so both writers check first and refuse rather than
 * guess. Same argument as `locate` in `edit.ts`, one span narrower.
 */
export function stillThere(line: string | undefined, at: LocatedTag): boolean {
  if (line === undefined) return false

  const written = line.slice(at.from, at.to)
  return written.startsWith('#') && written.slice(1).trim() === at.raw
}

/**
 * The line with one tag rewritten, keeping the spacing the author used.
 *
 * The gap after the `#` is preserved rather than normalised. `# bg: grove` and
 * `#bg: grove` both parse, the choice between them is the author's, and a rail
 * that quietly restyled every line it touched would show up as noise in their
 * next diff.
 */
export function rewriteTag(line: string, at: LocatedTag, command: TagCommand): string {
  const gap = /^\s*/.exec(line.slice(at.from + 1))![0]
  return `${line.slice(0, at.from)}#${gap}${formatTag(command)}${line.slice(at.to)}`
}

/**
 * The line with one tag cut out, or null when nothing is left but whitespace.
 *
 * Null rather than an empty line, because a tag on a line of its own *is* the
 * line — leaving a blank behind would make removing a background silently add a
 * paragraph break to the reading.
 *
 * The gap the tag leaves is closed rather than left: cutting `# bg: night` out
 * of `# bg: night # show: wren` should give back a line that looks written
 * rather than one with a hole in it. Indentation survives, because that is the
 * line's shape and not part of the hole.
 */
export function removeTag(line: string, at: LocatedTag): string | null {
  const head = line.slice(0, at.from)
  const tail = line.slice(at.to).trimStart()

  // Nothing but indentation before it, so the tag started the line's content
  // and whatever follows should start it now.
  if (head.trim().length === 0) {
    const kept = head + tail
    return kept.trim().length === 0 ? null : kept.trimEnd()
  }

  return tail.length === 0 ? head.trimEnd() : `${head.trimEnd()} ${tail.trimEnd()}`
}

/**
 * A new tag line, indented to match the block it joins.
 *
 * `lines` is the whole file and `at` is where the new line will go; the
 * indentation is taken from the line already there, or from the one above when
 * the section begins at the end of the file.
 */
export function newTagLine(lines: string[], at: number, command: TagCommand): string {
  const neighbour = lines[at - 1] ?? lines[at - 2] ?? ''
  const indent = /^[\t ]*/.exec(neighbour)![0]
  return `${indent}# ${formatTag(command)}`
}
