import { readFile } from 'node:fs/promises'
import type { Project } from '@shared/project'
import type { SearchHit, SearchRequest, SearchResult } from '@shared/types'
import { listInkFiles } from './project'
import { stripBom } from './text'

/**
 * Finding text across a project's ink.
 *
 * The editor's own search covers the file in front of the author; this covers
 * the other thirty-six. Deliberately a plain read-and-scan rather than a
 * spawned ripgrep: a project is a few dozen files and fifteen thousand lines,
 * which is milliseconds to read, and a bundled native binary would be a
 * per-platform packaging problem for a corpus that fits in cache.
 */

/** Enough to navigate by. A query matching more than this wants narrowing, not scrolling. */
const MAX_HITS = 500

/** Prose lines run long; a whole one in the results list would bury the match. */
const PREVIEW_CHARS = 200
/** How much of the line before the match to keep, so it reads in context. */
const LEAD_CHARS = 40

const ELLIPSIS = '\u2026'

/** Every character `RegExp` would otherwise read as syntax. */
function escapeLiteral(query: string): string {
  return query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The matcher, or the reason there isn't one.
 *
 * A bad regex is the author mid-typing — `(` on the way to `(a|b)` — so it is
 * reported as a message under the field rather than thrown.
 */
function matcher(request: SearchRequest): { regex: RegExp } | { problem: string } {
  const source = request.regex ? request.query : escapeLiteral(request.query)
  try {
    return { regex: new RegExp(source, request.caseSensitive ? 'g' : 'gi') }
  } catch (cause) {
    return { problem: cause instanceof Error ? cause.message : String(cause) }
  }
}

/**
 * A slice of a long line around the match, and where the match sits in it.
 *
 * Without this a match at character 800 shows a preview of the first 200
 * characters of the line and none of what was searched for.
 */
function windowed(text: string, column: number): { preview: string; column: number } {
  if (text.length <= PREVIEW_CHARS) return { preview: text, column }

  const start = Math.max(0, column - LEAD_CHARS)
  const end = start + PREVIEW_CHARS
  const head = start > 0 ? ELLIPSIS : ''
  const tail = end < text.length ? ELLIPSIS : ''

  return { preview: `${head}${text.slice(start, end)}${tail}`, column: column - start + head.length }
}

/** Every match in one line, as hits against `file`. */
function hitsInLine(file: string, line: number, text: string, regex: RegExp): SearchHit[] {
  const hits: SearchHit[] = []
  regex.lastIndex = 0

  let match = regex.exec(text)
  while (match !== null) {
    const { preview, column } = windowed(text, match.index)
    hits.push({ file, line, column, length: match[0].length, preview })

    // A pattern that can match nothing — `a*` — would otherwise return the same
    // empty match at the same index forever.
    if (match.index === regex.lastIndex) regex.lastIndex += 1
    match = regex.exec(text)
  }

  return hits
}

/**
 * Every occurrence of `request.query` in the project's ink, in file then line
 * order.
 *
 * An unreadable file is skipped rather than failing the search, matching what
 * `referencesTo` does with the same walk: one file the author has open in
 * another program is not a reason to answer nothing.
 */
export async function searchInk(project: Project, request: SearchRequest): Promise<SearchResult> {
  if (request.query.length === 0) return { hits: [], capped: false, problem: null }

  const built = matcher(request)
  if ('problem' in built) return { hits: [], capped: false, problem: built.problem }

  const files = await listInkFiles(project)
  const hits: SearchHit[] = []

  for (const file of files) {
    let source: string
    try {
      source = stripBom(await readFile(file.absolutePath, 'utf8'))
    } catch {
      continue
    }

    const lines = source.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      hits.push(...hitsInLine(file.path, index + 1, lines[index]!, built.regex))
      if (hits.length >= MAX_HITS) {
        return { hits: hits.slice(0, MAX_HITS), capped: true, problem: null }
      }
    }
  }

  return { hits, capped: false, problem: null }
}
