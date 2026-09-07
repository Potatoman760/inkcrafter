/**
 * Finding the knots and stitches a piece of ink declares.
 *
 * Used by the editor to make headers and diverts followable, and by the plan to
 * answer the question that closes the loop between the two: this chapter says it
 * becomes knot `arrival` — does that knot exist in the ink attached to it, and
 * where?
 */

/** `=== knot ===`, or `=== function name ===` which is not a place in the story. */
const KNOT = /^[ \t]*={2,}[ \t]*(function[ \t]+)?([A-Za-z_]\w*)/
/** `= stitch`, addressed as `knot.stitch`. */
const STITCH = /^[ \t]*=(?!=)[ \t]*([A-Za-z_]\w*)/

/**
 * A knot, and the ink file that declares it.
 *
 * The file is what says which part of the plan a knot belongs to: a Scene owns
 * one ink file, so everything that file declares is that Scene's — whatever the
 * knots happen to be called. A Scene titled "Forest encounter" whose file
 * declares `chapter1_forest` and four more is one Scene with five knots, and
 * only the file can say so.
 */
export interface KnotSource {
  knot: string
  /** Project-relative, as the plan records a Scene's file. */
  file: string
}

export interface KnotRef {
  /** Addressable name: `knot`, or `knot.stitch` for a stitch. */
  name: string
  /** The bare identifier as written. */
  title: string
  /** 1-based. */
  line: number
  /** 0-based offset of the name within its line. */
  column: number
  isFunction: boolean
  isStitch: boolean
}

export function scanKnots(source: string): KnotRef[] {
  const found: KnotRef[] = []
  let currentKnot: string | null = null

  for (const [index, text] of source.split(/\r?\n/).entries()) {
    const knot = KNOT.exec(text)
    if (knot) {
      const title = knot[2]!
      const isFunction = Boolean(knot[1])
      // A function is called, never travelled to, so it is not a destination.
      currentKnot = isFunction ? null : title

      found.push({
        name: title,
        title,
        line: index + 1,
        column: text.indexOf(title, knot[0].length - title.length),
        isFunction,
        isStitch: false
      })
      continue
    }

    const stitch = STITCH.exec(text)
    if (stitch && currentKnot) {
      const title = stitch[1]!
      found.push({
        name: `${currentKnot}.${title}`,
        title,
        line: index + 1,
        column: text.indexOf(title, stitch[0].length - title.length),
        isFunction: false,
        isStitch: true
      })
    }
  }

  return found
}

/** Where a knot is declared within one file, or null. */
export function findKnot(source: string, name: string): KnotRef | null {
  return scanKnots(source).find((knot) => knot.name === name && !knot.isFunction) ?? null
}

/** The innermost section a line sits in — a stitch before the knot holding it. */
export function knotAt(source: string, line: number): string | null {
  const above = scanKnots(source).filter((knot) => !knot.isFunction && knot.line <= line)
  return above.length > 0 ? above[above.length - 1]!.name : null
}

/** One place the ink says to go, and where that instruction is written. */
export interface DivertRef {
  /** The destination as written: `knot`, `knot.stitch`, or a bare stitch name. */
  target: string
  /** 1-based. */
  line: number
  /** 0-based offset of the target within its line. */
  column: number
}

/**
 * `-> somewhere`, `<- somewhere`, and the `-> somewhere ->` of a tunnel.
 *
 * `->->` returns from a tunnel and names nothing, which falls out of the
 * pattern rather than being excluded: nothing after it is an identifier. The
 * two words ink reserves are excluded, because `-> END` is a way of stopping
 * rather than a place to go.
 */
const DIVERT = /(?:->|<-)[ \t]*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/g

/** Not destinations: ways of ending, which no knot declares. */
const TERMINAL = new Set(['END', 'DONE'])

export function scanDiverts(source: string): DivertRef[] {
  const found: DivertRef[] = []

  for (const [index, text] of source.split(/\r?\n/).entries()) {
    // A divert may precede a tag or a comment on the same line, so the line is
    // cut at whichever comes first rather than skipped. Block comments are not
    // handled: a `/* */` spanning lines is rare, and the cost of being wrong is
    // one underline on text that does not run.
    const comment = text.indexOf('//')
    const tag = text.indexOf('#')
    const ends = [comment, tag].filter((at) => at >= 0)
    const code = ends.length > 0 ? text.slice(0, Math.min(...ends)) : text

    for (const match of code.matchAll(DIVERT)) {
      const target = match[1]!
      if (TERMINAL.has(target)) continue
      found.push({
        target,
        line: index + 1,
        column: match.index + match[0].length - target.length
      })
    }
  }

  return found
}

/**
 * The names a divert could mean, best first.
 *
 * A bare name written inside a knot is that knot's own stitch before it is
 * anything else — ink resolves the innermost scope first, and so does this, or
 * a `-> ending` inside `chapter_one` would lead to somebody else's `ending`.
 */
export function divertCandidates(target: string, within: string | null): string[] {
  return within && !target.includes('.') ? [`${within}.${target}`, target] : [target]
}
