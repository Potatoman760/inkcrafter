/**
 * What ink does to prose.
 *
 * Drafted text is pasted into a source file, where ink reads it as syntax rather
 * than as words. Every rule here was checked against the real compiler, because
 * the two failure modes look nothing alike and only one of them is obvious:
 *
 * - **Hard errors.** `{`, `|`, `->`, `<-` and the declaration keywords stop the
 *   story compiling. Loud, and the author sees them at once.
 * - **Silent corruption.** `//` swallows the rest of the line; so does a `#`,
 *   which turns it into a tag. A leading `-` is eaten as a gather, `<>` as glue,
 *   `\` as an escape. A leading `*` or `+` quietly becomes a *choice* — prose
 *   turning into structure with no error at all. These are the dangerous ones.
 *
 * `>` is not ink syntax and is perfectly safe; it used to be on this list by
 * mistake, which meant a paragraph beginning with a quotation mark of that shape
 * was thrown away for no reason.
 */

/** Characters that change meaning wherever they appear in a line. */
export const INK_UNSAFE_ANYWHERE = ['{', '}', '|', '->', '<-', '<>', '//', '/*', '#', '\\'] as const

/** Characters that only mean something at the start of a line. */
export const INK_UNSAFE_AT_LINE_START = ['*', '+', '-', '=', '~'] as const

/**
 * Words ink reads as declarations when they open a line.
 *
 * `DONE` and `END` are deliberately absent: they only mean anything after a
 * `->`, and as ordinary words they compile and render untouched. Listing them
 * would throw away "END of the line, she thought." for nothing.
 */
export const INK_KEYWORDS = ['INCLUDE', 'VAR', 'CONST', 'LIST', 'EXTERNAL', 'TODO'] as const

/**
 * Why this paragraph cannot be written into an ink file as it stands, or null
 * when it is safe. The reason is phrased for an author reading it, not a parser.
 */
export function inkHazardIn(paragraph: string): string | null {
  const text = paragraph.trim()
  if (text.length === 0) return 'it is empty'

  const first = text[0]!
  if ((INK_UNSAFE_AT_LINE_START as readonly string[]).includes(first)) {
    if (first === '*' || first === '+') return `it starts with ${first}, which ink reads as a choice`
    if (first === '-') return 'it starts with a hyphen, which ink reads as a gather and swallows'
    if (first === '=') return 'it starts with =, which ink reads as a knot or stitch heading'
    return 'it starts with ~, which ink reads as a line of logic'
  }

  const keyword = INK_KEYWORDS.find((word) => new RegExp(`^${word}\\b`).test(text))
  if (keyword) return `it starts with ${keyword}, which ink reads as a declaration`

  const unsafe = INK_UNSAFE_ANYWHERE.find((token) => text.includes(token))
  if (unsafe) {
    if (unsafe === '#') return 'it contains #, which turns the rest of the line into a tag'
    if (unsafe === '//' || unsafe === '/*') return `it contains ${unsafe}, which starts a comment`
    if (unsafe === '<>') return 'it contains <>, which ink reads as glue'
    if (unsafe === '\\') return 'it contains a backslash, which ink reads as an escape'
    if (unsafe === '->' || unsafe === '<-') return `it contains ${unsafe}, which ink reads as a divert`
    return `it contains ${unsafe}, which ink reads as syntax`
  }

  return null
}

export function isSafeInkProse(paragraph: string): boolean {
  return inkHazardIn(paragraph) === null
}
