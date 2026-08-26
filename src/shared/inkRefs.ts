/**
 * What points at an ink file, and how to follow it when the file moves.
 *
 * Three things name an ink file by its path, and all three break when it is
 * renamed:
 *
 * - `INCLUDE` lines in other ink files, which ink resolves *relative to the
 *   file doing the including* — so `ink/main.ink` reaches its sibling as
 *   `chapter1.ink` and a file one folder down as `act-one/opening.ink`.
 * - `project.main`, the entry point, project-relative.
 * - `plan.json`, whose Scenes own one app-managed file, also project-relative.
 *
 * A rename that does not follow them leaves a story that no longer compiles,
 * and says nothing about why — which is the class of failure this whole file
 * exists to prevent. The functions here are pure and work on strings, so the
 * awkward part (relative paths in both directions) can be tested without a
 * disk.
 */

/** Where an INCLUDE sits in a file, and what it names. */
export interface InkInclude {
  /** 0-based, so it can be reported as `line + 1`. */
  line: number
  /** Exactly as written, relative to the including file. */
  written: string
  /** Project-relative, which is how everything else names a file. */
  target: string
}

const INCLUDE_LINE = /^([ \t]*INCLUDE[ \t]+)(\S.*?)([ \t]*)$/

/** The folder part of a project-relative path, without a trailing slash. */
function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

/**
 * A path written relative to `fromFile`, resolved to a project-relative one.
 *
 * `..` is honoured, and anything that climbs above the project comes back as
 * the segments that are left — a path outside the project is not something
 * this can rename, and returning it unchanged means it is never matched.
 */
export function resolveInclude(fromFile: string, written: string): string {
  const segments = folderOf(fromFile).split('/').filter(Boolean)

  for (const part of written.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }

  return segments.join('/')
}

/**
 * A project-relative path as `fromFile` would have to write it.
 *
 * The inverse of `resolveInclude`, and the reason a move is not a search and
 * replace: the same file is `chapter1.ink` to one includer and
 * `../chapter1.ink` to another.
 */
export function relativeInclude(fromFile: string, target: string): string {
  const from = folderOf(fromFile).split('/').filter(Boolean)
  const to = target.split('/')

  let common = 0
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++

  const up = '../'.repeat(from.length - common)
  const down = to.slice(common).join('/')

  // A sibling is written bare rather than as `./sibling`, which is what every
  // ink file in the wild looks like.
  return `${up}${down}`
}

/** Every INCLUDE in one file, with what each one actually points at. */
export function includesIn(fromFile: string, source: string): InkInclude[] {
  return source.split('\n').flatMap((text, line) => {
    const match = INCLUDE_LINE.exec(text)
    if (!match) return []

    const written = match[2]!
    return [{ line, written, target: resolveInclude(fromFile, written) }]
  })
}

/**
 * The same source with every INCLUDE of `from` rewritten to name `to`.
 *
 * Returns null when nothing matched, so a caller can leave a file alone rather
 * than rewriting it byte-for-byte and touching its timestamp.
 */
export function rewriteIncludes(
  fromFile: string,
  source: string,
  from: string,
  to: string
): string | null {
  let changed = false

  const lines = source.split('\n').map((text) => {
    const match = INCLUDE_LINE.exec(text)
    if (!match) return text
    if (resolveInclude(fromFile, match[2]!) !== from) return text

    changed = true
    return `${match[1]}${relativeInclude(fromFile, to)}${match[3]}`
  })

  return changed ? lines.join('\n') : null
}

/** The first line that is neither blank nor a `//` comment. */
function afterLeadingComments(lines: string[]): number {
  let at = 0
  while (at < lines.length && /^[ \t]*(?:\/\/.*)?$/.test(lines[at]!)) at++
  return at
}

/**
 * The same source with its INCLUDE lines gathered into one block, in the order
 * the story is read.
 *
 * `groups` is what the plan owns — one group per chapter, each holding its
 * Scene files in order — so the entry point lists the story the way the outline
 * does. Anything else the entry point includes (a map, the generated state
 * catalogue, hand-written ink) has no place in that structure, so it keeps the
 * order it was written in and follows at the end rather than being interleaved.
 *
 * The block goes above the first line that does anything, which is where the
 * only other writer of this file puts its own include and where a divert would
 * otherwise strand a declaration. Everything else stays exactly where it is.
 *
 * Returns null when the file already says this, so a caller can leave it alone
 * rather than rewriting it byte-for-byte — and when the plan owns no files at
 * all, since there is no reading order to impose.
 */
export function orderIncludes(
  fromFile: string,
  source: string,
  groups: string[][]
): string | null {
  const owned = new Set(groups.flat().filter((target) => target !== fromFile))
  if (owned.size === 0) return null

  const lines = source.split('\n')
  const found = includesIn(fromFile, source)
  const written = new Map(found.map((one) => [one.target, one.written]))

  // A file named twice is declared once. The second INCLUDE was never doing
  // anything, and keeping it would make the block disagree with the outline.
  const seen = new Set<string>()
  const declare = (targets: string[], how: (target: string) => string): string[] => {
    const out: string[] = []
    for (const target of targets) {
      if (target === fromFile || seen.has(target)) continue
      seen.add(target)
      out.push(`INCLUDE ${how(target)}`)
    }
    return out
  }

  // A blank line between chapters, so the block is read in the same chunks the
  // outline is.
  const block: string[] = []
  const push = (declarations: string[]): void => {
    if (declarations.length === 0) return
    if (block.length > 0) block.push('')
    block.push(...declarations)
  }

  for (const group of groups) push(declare(group, (target) => relativeInclude(fromFile, target)))
  push(
    declare(
      found.map((one) => one.target).filter((target) => !owned.has(target)),
      // Kept exactly as the author wrote it: `../maps/world.ink` is their path
      // to that file and re-deriving it would be a diff for nothing.
      (target) => written.get(target)!
    )
  )

  const at = afterLeadingComments(lines)
  const gone = new Set(found.map((one) => one.line))

  const rest: string[] = []
  for (let index = at; index < lines.length; index++) {
    if (gone.has(index)) continue
    const text = lines[index]!
    // The gap an include left behind. Without this, lifting one out of the
    // middle of the file widens the space where it stood.
    if (text.trim() === '' && gone.has(index - 1) && (rest[rest.length - 1] ?? '').trim() === '') {
      continue
    }
    rest.push(text)
  }
  while (rest.length > 0 && rest[0]!.trim() === '') rest.shift()

  const head = lines.slice(0, at)
  while (head.length > 0 && head[head.length - 1]!.trim() === '') head.pop()

  const next = [
    ...head,
    ...(head.length > 0 ? [''] : []),
    ...block,
    ...(rest.length > 0 ? ['', ...rest] : [])
  ].join('\n')

  if (next === source) return null
  return next.endsWith('\n') ? next : `${next}\n`
}

/**
 * Everything that would have to change, or break, if `path` moved or went away.
 *
 * Gathered rather than acted on, so the same walk can rewrite a rename and warn
 * before a delete.
 */
export interface InkReference {
  kind: 'include' | 'entry' | 'plan'
  /** The file holding the reference, project-relative. Absent for the manifest. */
  file?: string
  /** 1-based, for an INCLUDE. */
  line?: number
  /** What a person should read. */
  detail: string
}

export function describeReferences(references: InkReference[]): string {
  return references
    .map((reference) =>
      reference.line === undefined
        ? reference.detail
        : `${reference.file}:${reference.line} — ${reference.detail}`
    )
    .join('\n')
}
