/**
 * Finding the knots and stitches a piece of ink declares.
 *
 * Used by the editor to make headers followable, and by the plan to answer the
 * question that closes the loop between the two: this chapter says it becomes
 * knot `arrival` — does that knot exist in the ink attached to it, and where?
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
