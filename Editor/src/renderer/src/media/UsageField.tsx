import { useEffect, useState } from 'react'
import type { MediaAsset } from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import type { MediaUse } from '@shared/types'
import { Field, Hint } from '../design/components'

interface UsageFieldProps {
  project: Project | null
  asset: MediaAsset
  /** Opens the ink at the line a tag sits on. */
  onOpen: (path: string, line: number) => void
}

/**
 * Where this asset is actually used, and how often.
 *
 * The catalogue says what exists; `preflight` says whether a tag names
 * something real. Neither answers the question in front of an author looking at
 * a sprite they do not recognise — whether anything shows it, and where. A look
 * nothing uses is not an error, so nothing else was ever going to mention it.
 *
 * Read once per asset rather than held with the catalogue: the scan walks every
 * ink file, and this is the only screen that asks.
 */
export function UsageField({ project, asset, onOpen }: UsageFieldProps): React.JSX.Element {
  const [uses, setUses] = useState<MediaUse[] | null>(null)

  useEffect(() => {
    if (!project) {
      setUses([])
      return
    }

    let live = true
    setUses(null)
    void window.inkcrafter.project.mediaUsage(project).then((usage) => {
      // Keyed by media kind, which is what this asset already knows itself to
      // be. A kind no tag can name — a hotspot, a combatant — simply never has
      // an entry, which is the right answer rather than a special case.
      if (live) setUses(usage[`${asset.kind}:${asset.name}`] ?? [])
    })

    return () => {
      live = false
    }
  }, [project, asset.kind, asset.name])

  if (uses === null) {
    return (
      <Field as="div" label="Used in">
        <Hint tight>Reading the story…</Hint>
      </Field>
    )
  }

  return (
    <Field
      as="div"
      label="Used in"
      note={uses.length === 0 ? 'Nowhere yet' : `${uses.length} place${uses.length === 1 ? '' : 's'}`}
    >
      {uses.length === 0 ? (
        <Hint tight>
          Nothing names this yet. That is not a problem — an asset can be catalogued before the
          scene that shows it is written.
        </Hint>
      ) : (
        <ul className="media-uses">
          {uses.map((use) => (
            <li key={`${use.file}:${use.line}`}>
              <button
                type="button"
                className="media-use"
                onClick={() => onOpen(use.file, use.line)}
              >
                {/* The knot leads, because it is what an author is looking for;
                    the file and line are how to get there. */}
                <span className="media-use__knot">{use.knot ?? 'before the first knot'}</span>
                <span className="media-use__where">
                  {use.file}:{use.line}
                </span>
                {use.variant && <span className="media-use__look">{use.variant}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  )
}
