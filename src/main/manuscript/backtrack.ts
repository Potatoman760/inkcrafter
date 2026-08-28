/**
 * Walking a story backwards through the diverts written in it.
 *
 * The forward search answers the better question — how does a reader actually
 * get here — and where it can answer it, it wins. It often cannot: a knot at
 * the end of a long story is behind every choice before it, and the search
 * gives up long before replaying them all.
 *
 * So this is the cruder question that always has an answer, read straight off
 * the source: who mentions this knot, and who mentions them, back to something
 * nothing mentions at all.
 *
 * Deliberately not clever. The first reference found wins, conditions are not
 * read, and a divert behind a stat check counts exactly as much as one at the
 * top of a knot. What comes out is a place to start reading, not a claim about
 * what any reader would do.
 */

/** `=== knot ===`. A `function` knot is not a place in the story. */
const KNOT = /^[ \t]*={2,}[ \t]*(function[ \t]+)?([A-Za-z_]\w*)/
/** `-> knot`, `->-> knot`, `<- knot`. A `knot.stitch` target counts as its knot. */
const REFERENCE = /(?:->|<-)[ \t]*([A-Za-z_]\w*)/g

/** Ends the flow rather than naming somewhere to go. */
const TERMINAL = new Set(['END', 'DONE'])

/** Stops a pathological chain; far longer than any real story's divert depth. */
const MAX_DEPTH = 500

export interface Reference {
  /** The knot the reference was written inside. */
  from: string
  file: string
  /** 1-based. */
  line: number
}

/**
 * The first reference to each knot, in file order then line order.
 *
 * First rather than best: with no conditions read there is nothing to prefer a
 * later one for, and taking the first makes the walk deterministic.
 */
export function firstReferences(files: Iterable<[string, string[]]>): Map<string, Reference> {
  const first = new Map<string, Reference>()

  for (const [file, lines] of files) {
    // Null while inside a function, or before the file's first knot: a divert
    // written there has no knot to be walked back to.
    let inside: string | null = null

    lines.forEach((text, index) => {
      const knot = KNOT.exec(text)
      if (knot) {
        inside = knot[1] ? null : knot[2]!
        return
      }
      if (inside === null) return

      for (const match of text.matchAll(REFERENCE)) {
        const target = match[1]!
        // A knot diverting to itself says nothing about how it is reached.
        if (TERMINAL.has(target) || target === inside || first.has(target)) continue
        first.set(target, { from: inside, file, line: index + 1 })
      }
    })
  }

  return first
}

/**
 * The chain from the furthest knot back, forward to `target`.
 *
 * Stops at a knot nothing refers to, or where the chain meets itself — a hub
 * that returns to itself is ordinary, and going round it is not progress. The
 * target is always the last element, so the first is where reading should
 * begin, even when that is the target itself.
 */
export function walkBack(target: string, first: Map<string, Reference>): string[] {
  const chain = [target]
  const seen = new Set([target])

  while (chain.length < MAX_DEPTH) {
    const reference = first.get(chain[0]!)
    if (!reference || seen.has(reference.from)) break
    chain.unshift(reference.from)
    seen.add(reference.from)
  }

  return chain
}
