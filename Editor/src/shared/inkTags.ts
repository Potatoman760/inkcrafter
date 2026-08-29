import { parseTag, type TagCommand } from './bundle/tagSpec'

/**
 * Finding the tags a piece of ink writes, without running it.
 *
 * The alternative is to play the story and read `currentTags`, which only ever
 * reaches the branches that were taken — and the tag that is wrong is nearly
 * always on the branch nobody tried. Reading the source finds all of them, at
 * the cost of seeing tags on lines that may never be reached, which for a
 * warning is the right trade.
 *
 * Deliberately not a parser. It knows only enough to find `#` where ink means a
 * tag: not inside a `//` comment, and not inside `{…}`, where a `#` would be
 * part of an expression rather than the start of a tag.
 */

export interface TagUse {
  /** The tag text, without the `#`. */
  raw: string
  /** What it means, or null when we own the key but cannot read the value. */
  command: TagCommand | null
  /** 1-based, in the file it came from. */
  line: number
  /**
   * Where it sits in its line: `from` on the `#`, `to` one past the last
   * character of the tag itself.
   *
   * Enough to rewrite one tag and leave the rest of the line alone, which
   * matters because a line may carry two of them, or a tag after prose. `from`
   * is on the `#` rather than after it, because removing a tag has to take its
   * `#` with it; `to` stops short of trailing spaces for the same reason in
   * reverse — rewriting the first of two tags must not swallow the gap before
   * the second.
   */
  from: number
  to: number
}

export function scanTags(source: string): TagUse[] {
  const found: TagUse[] = []
  let inBlockComment = false

  for (const [index, text] of source.split(/\r?\n/).entries()) {
    const code = strip(text, inBlockComment)
    inBlockComment = code.inBlockComment

    for (const tag of splitTags(code.text)) {
      found.push({ ...tag, command: parseTag(tag.raw), line: index + 1 })
    }
  }

  return found
}

interface Stripped {
  text: string
  inBlockComment: boolean
}

/**
 * The line with its comments blanked out, and whether a block comment is still
 * open.
 *
 * Blanked rather than removed, so every surviving character keeps the index it
 * had in the original line. `TagUse` reports a span, and a stripper that closed
 * the gaps would be reporting spans into a string the caller does not have.
 * Text after `//` is dropped outright instead of blanked: nothing there can be
 * a tag, so no index past it is ever asked for.
 */
function strip(text: string, inBlockComment: boolean): Stripped {
  let out = ''
  let open = inBlockComment

  for (let at = 0; at < text.length; at++) {
    if (open) {
      if (text.startsWith('*/', at)) {
        open = false
        out += '  '
        at++
        continue
      }
      out += ' '
      continue
    }

    if (text.startsWith('/*', at)) {
      open = true
      out += '  '
      at++
      continue
    }

    // Everything after `//` is a comment, tags included.
    if (text.startsWith('//', at)) break

    out += text[at]
  }

  return { text: out, inBlockComment: open }
}

/**
 * The tags on one line of code, each with where it sits.
 *
 * A tag runs from `#` to the next `#` or the end of the line, which is how ink
 * lets several sit on one line. A `#` inside `{…}` is part of an expression, so
 * brace depth is tracked rather than assuming the first `#` starts a tag.
 */
interface RawTag {
  raw: string
  from: number
  to: number
}

function splitTags(text: string): RawTag[] {
  const tags: RawTag[] = []
  let depth = 0
  let start = -1

  /** Closes the tag that opened at `start` and runs up to `end`. */
  const flush = (end: number): void => {
    if (start === -1) return

    const body = text.slice(start + 1, end)
    const raw = body.trim()
    if (raw.length > 0) {
      const trailing = body.length - body.trimEnd().length
      tags.push({ raw, from: start, to: end - trailing })
    }

    start = -1
  }

  for (let at = 0; at < text.length; at++) {
    const character = text[at]
    if (character === '{') depth++
    else if (character === '}') depth = Math.max(0, depth - 1)

    if (character === '#' && depth === 0) {
      flush(at)
      start = at
    }
  }

  flush(text.length)
  return tags
}
