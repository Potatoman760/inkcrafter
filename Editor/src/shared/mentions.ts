/**
 * Finding codex entries mentioned in ink source.
 *
 * A prose-novel tool can scan the whole manuscript, but ink files are a mix of
 * prose and code. Matching everywhere produces nonsense: a character called
 * "Wren" would match the divert `-> wren_route`, the variable `wren_trust`, and
 * the comment reminding you to rewrite her introduction — none of which are
 * mentions of Wren in the story. So detection runs only over the parts of the
 * file that are actually shown to the player.
 */

import type { CodexEntry } from './codex'
import type { NameConflict } from './project'

export interface TextRange {
  from: number
  to: number
}

export interface Mention extends TextRange {
  entryId: string
  /** The matched text as it appears in the source, for display. */
  text: string
}

const LINE_LEVEL_LOGIC = /^(?:VAR|CONST|LIST|EXTERNAL|INCLUDE)\b/
/** Choice bullets (`*`, `+`, possibly nested) and gathers (`-`, but not `->`). */
const BULLET = /^(?:[*+](?:\s*[*+])*|-(?![>-])(?:\s*-(?![>-]))*)\s*/
/** A choice or gather label, e.g. `(again)`. */
const LABEL = /^\([A-Za-z_]\w*\)\s*/
/** A divert, tunnel or thread target: `-> forest.clearing`. */
const DIVERT_TARGET = /^\s*(?:->)?\s*[A-Za-z_]\w*(?:\.\w+)*/

/** Position of the `}` matching an already-consumed `{`, or `limit` if it is on a later line. */
function findClosingBrace(source: string, from: number, limit: number): number {
  let depth = 1
  for (let i = from; i < limit; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return i
  }
  return limit
}

/**
 * Returns the ranges of `source` that are player-facing prose.
 *
 * Excluded: comments, tags, declarations and `~` logic lines, knot and stitch
 * headers, choice bullets and labels, divert targets, and the logic inside
 * `{...}`. Conditional *text* inside braces is kept — in `{cold: You shiver.}`
 * the condition is code but "You shiver." is prose.
 */
export function proseRanges(source: string): TextRange[] {
  const ranges: TextRange[] = []
  let inBlockComment = false
  let braceDepth = 0
  let lineStart = 0

  while (lineStart <= source.length) {
    const newline = source.indexOf('\n', lineStart)
    const lineEnd = newline === -1 ? source.length : newline
    let i = lineStart
    let segStart = -1

    const endSegment = (to: number): void => {
      if (segStart >= 0 && to > segStart) ranges.push({ from: segStart, to })
      segStart = -1
    }

    if (inBlockComment) {
      const close = source.indexOf('*/', i)
      if (close === -1 || close >= lineEnd) {
        lineStart = lineEnd + 1
        if (newline === -1) break
        continue
      }
      i = close + 2
      inBlockComment = false
    }

    while (i < lineEnd && /\s/.test(source[i]!)) i++

    const rest = source.slice(i, lineEnd)
    const isSkippedLine =
      rest.startsWith('//') || rest.startsWith('~') || rest.startsWith('=') || LINE_LEVEL_LOGIC.test(rest)

    if (isSkippedLine) {
      lineStart = lineEnd + 1
      if (newline === -1) break
      continue
    }

    const bullet = BULLET.exec(rest)
    if (bullet) {
      i += bullet[0].length
      // Inside a multiline `{}` block a bulleted line is a branch, so anything
      // up to its `:` is a condition (`- else:`, `- courage > 2:`), not prose.
      if (braceDepth > 0) {
        const condition = /^[^:{}|]*:/.exec(source.slice(i, lineEnd))
        if (condition) i += condition[0].length
      }
      const label = LABEL.exec(source.slice(i, lineEnd))
      if (label) i += label[0].length
    }

    while (i < lineEnd) {
      const pair = source.slice(i, i + 2)

      if (pair === '//') {
        endSegment(i)
        i = lineEnd
        break
      }

      if (pair === '/*') {
        endSegment(i)
        const close = source.indexOf('*/', i + 2)
        if (close === -1 || close >= lineEnd) {
          inBlockComment = true
          i = lineEnd
          break
        }
        i = close + 2
        continue
      }

      if (source[i] === '#') {
        endSegment(i)
        i = lineEnd
        break
      }

      if (pair === '->' || pair === '<-') {
        endSegment(i)
        i += 2
        const target = DIVERT_TARGET.exec(source.slice(i, lineEnd))
        if (target) i += target[0].length
        continue
      }

      if (pair === '<>') {
        endSegment(i)
        i += 2
        continue
      }

      if (source[i] === '{') {
        endSegment(i)
        braceDepth++
        i++
        const close = findClosingBrace(source, i, lineEnd)
        const inner = source.slice(i, close)
        const colon = inner.indexOf(':')
        if (colon !== -1) {
          // `{condition: text}` — drop the condition, keep the text.
          i += colon + 1
        } else if (!inner.includes('|')) {
          // No alternatives and no condition, so this is a bare expression or a
          // variable print: `{courage >= 2}`, `{archivist_name}`. All logic.
          i = close
        }
        continue
      }

      if (source[i] === '}') {
        endSegment(i)
        braceDepth = Math.max(0, braceDepth - 1)
        i++
        continue
      }

      if (braceDepth > 0 && source[i] === '|') {
        endSegment(i)
        i++
        continue
      }

      if (segStart < 0) segStart = i
      i++
    }

    endSegment(Math.min(i, lineEnd))

    lineStart = lineEnd + 1
    if (newline === -1) break
  }

  return ranges
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds the matcher for one entry: its name plus aliases, with a trailing
 * optional plural so "Goblin" also finds "Goblins" without needing an alias.
 * Longest term first, so "Wren Calloway" wins over the bare "Wren".
 */
function buildPattern(entry: CodexEntry): RegExp | null {
  const terms = [entry.name, ...entry.aliases]
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .sort((a, b) => b.length - a.length)

  if (terms.length === 0) return null

  const body = terms.map(escapeRegExp).join('|')
  const flags = entry.tracking.caseSensitive ? 'gu' : 'giu'
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${body})(?:e?s)?(?![\\p{L}\\p{N}_])`, flags)
}

function isExcluded(source: string, index: number, entry: CodexEntry): boolean {
  const { caseSensitive, exclusions } = entry.tracking
  return exclusions.some((raw) => {
    const phrase = raw.trim()
    if (phrase.length === 0) return false
    const candidate = source.slice(index, index + phrase.length)
    return caseSensitive
      ? candidate === phrase
      : candidate.toLowerCase() === phrase.toLowerCase()
  })
}

interface EntryPattern {
  entry: CodexEntry
  pattern: RegExp
}

function buildPatterns(entries: CodexEntry[]): EntryPattern[] {
  return entries
    .filter((entry) => entry.tracking.byName)
    .map((entry) => ({ entry, pattern: buildPattern(entry) }))
    .filter((candidate): candidate is EntryPattern => candidate.pattern !== null)
}

function collect(source: string, ranges: TextRange[], patterns: EntryPattern[]): Mention[] {
  if (patterns.length === 0) return []

  const mentions: Mention[] = []

  for (const range of ranges) {
    const text = source.slice(range.from, range.to)
    for (const { entry, pattern } of patterns) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text)) !== null) {
        const from = range.from + match.index
        if (isExcluded(source, from, entry)) continue
        mentions.push({ entryId: entry.id, from, to: from + match[0].length, text: match[0] })
      }
    }
  }

  return mentions.sort((a, b) => a.from - b.from || a.to - b.to)
}

/**
 * Finds every codex mention in ink source, in document order.
 * Entries with name tracking switched off are skipped entirely.
 */
export function findMentions(source: string, entries: CodexEntry[]): Mention[] {
  return collect(source, proseRanges(source), buildPatterns(entries))
}

/**
 * The same matching over text that is already prose — a rendered manuscript
 * paragraph, where the ink-aware range filtering has nothing left to exclude
 * because the runtime has already resolved the logic away.
 */
export function findMentionsInProse(text: string, entries: CodexEntry[]): Mention[] {
  return collect(text, [{ from: 0, to: text.length }], buildPatterns(entries))
}

/**
 * Names and aliases claimed by more than one tracked entry.
 *
 * Once a project links several libraries this stops being hypothetical: two
 * libraries can each hold a "Wren", and detection has no way to tell which one
 * the prose means. Rather than pick, the conflict is reported so the author can
 * rename one, alias it differently, or stop tracking it.
 */
export function findNameConflicts(entries: CodexEntry[]): NameConflict[] {
  const claims = new Map<string, { term: string; entryIds: Set<string> }>()

  for (const entry of entries) {
    if (!entry.tracking.byName) continue
    for (const term of [entry.name, ...entry.aliases]) {
      const trimmed = term.trim()
      if (trimmed.length === 0) continue
      const key = trimmed.toLowerCase()
      const claim = claims.get(key) ?? { term: trimmed, entryIds: new Set<string>() }
      claim.entryIds.add(entry.id)
      claims.set(key, claim)
    }
  }

  return [...claims.values()]
    .filter((claim) => claim.entryIds.size > 1)
    .map((claim) => ({ term: claim.term, entryIds: [...claim.entryIds] }))
    .sort((a, b) => a.term.localeCompare(b.term))
}

export function countMentions(mentions: Mention[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const mention of mentions) {
    counts[mention.entryId] = (counts[mention.entryId] ?? 0) + 1
  }
  return counts
}
