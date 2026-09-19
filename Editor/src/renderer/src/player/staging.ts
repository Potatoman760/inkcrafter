import { scanKnots } from '@shared/inkKnots'
import { scanTags } from '@shared/inkTags'

/**
 * What is on stage at the line the author is looking at, read off the source.
 *
 * The preview used to compile the ink and play it from the knot the cursor was
 * in, which answered a harder question than anybody asked and got the easy one
 * wrong. A knot that opens with a guard — `{trial_ally != "dinah": -> villa_hub}`
 * — walks straight back out under default variables, so the scene's own
 * `# bg:` never ran and the stage sat empty on a scene that has a background
 * written three lines below the header.
 *
 * Reading the source instead cannot be gated, does not need the story to
 * compile, and does not need a variable to hold a particular value. It is the
 * same trade `inkTags` already makes and for the same reason: the staging that
 * is wrong is nearly always on the branch nobody reached.
 *
 * The scan runs *up* from the cursor and stops at the knot header above it.
 * Nothing is followed — not a divert, not a tunnel, not the knot before this one
 * in the file. A knot is where an author sets the scene, so a knot is as far
 * back as its staging can have come from, and anything further would be
 * guessing at a route the reader may never take.
 */
export interface Staging {
  /** The knot the scan stopped at, or null above the first one in the file. */
  knot: string | null
  /** Tag bodies between that header and the cursor, in the order written. */
  tags: string[]
}

/**
 * A stitch is not a boundary: staging set at the top of a knot still holds in
 * the stitches under it, which is how ink reads and how the old preview bounded
 * itself too. A `=== function ===` header is a boundary, because a function
 * body is not a scene.
 */
export function stagingAt(source: string, line: number): Staging {
  const header = scanKnots(source)
    .filter((knot) => !knot.isStitch && knot.line <= line)
    .pop()

  // Above the first knot there is no header to stop at, so the file's own top
  // is the boundary — a preamble with a `# bg:` in it is still staging.
  const from = header?.line ?? 0

  return {
    knot: header && !header.isFunction ? header.name : null,
    tags: scanTags(source)
      .filter((use) => use.line > from && use.line <= line)
      .map((use) => use.raw)
  }
}
