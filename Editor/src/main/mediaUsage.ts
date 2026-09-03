import { readFile } from 'node:fs/promises'
import { scanKnots } from '@shared/inkKnots'
import { scanTags } from '@shared/inkTags'
import { mediaRefOf } from '@shared/bundle/tagSpec'
import type { MediaUsage, MediaUse } from '@shared/types'
import type { Project } from '@shared/project'
import { listInkFiles } from './project'
import { stripBom } from './text'

/**
 * Where each catalogued picture, track and clip is actually used.
 *
 * The catalogue says what exists and `preflight` says whether a tag names
 * something real; neither answers the question an author has in front of the
 * media panel, which is whether anything names *this* — and if so, where. A
 * look nothing shows is not an error, so nothing was ever going to report it.
 *
 * Every asset in one pass, keyed by kind and name, rather than a query per
 * selection: the walk reads every ink file, and the panel changes selection far
 * more often than the story changes.
 */

/**
 * How a use is filed: by media *kind* and name, not by the tag's spelling.
 *
 * `# bg:` names a `background` and `# char:` a `character`, and the kind is
 * what the catalogue on the other side of this is keyed by — so the panel can
 * look an asset up with the fields it already has.
 */
export function usageKey(kind: string, name: string): string {
  return `${kind}:${name}`
}

export async function mediaUsage(project: Project): Promise<MediaUsage> {
  const usage: MediaUsage = {}

  for (const file of await listInkFiles(project)) {
    let source: string
    try {
      source = stripBom(await readFile(file.absolutePath, 'utf8'))
    } catch {
      // Skipped rather than failed, as the other whole-project walks do: one
      // file open in another program is not a reason to answer nothing.
      continue
    }

    // Sorted by line so the walk below can take the last one at or above a tag.
    const knots = scanKnots(source)
      .filter((knot) => !knot.isFunction)
      .sort((a, b) => a.line - b.line)

    for (const use of scanTags(source)) {
      if (!use.command) continue
      const ref = mediaRefOf(use.command)
      if (!ref) continue

      const key = usageKey(ref.kind, ref.name)
      const entry: MediaUse = {
        file: file.path,
        line: use.line,
        // A tag above the first knot belongs to no knot, which is a real thing
        // to see: it is the shape that never reaches a reader.
        knot: knotAt(knots, use.line),
        variant: ref.variant,
        raw: use.raw
      }

      usage[key] = usage[key] ? [...usage[key], entry] : [entry]
    }
  }

  return usage
}

/** The innermost section a line sits in — a stitch before the knot holding it. */
function knotAt(knots: { name: string; line: number }[], line: number): string | null {
  let found: string | null = null
  for (const knot of knots) {
    if (knot.line > line) break
    found = knot.name
  }
  return found
}
