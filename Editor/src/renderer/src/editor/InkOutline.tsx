import { useMemo } from 'react'
import { scanKnots, type KnotRef } from '@shared/inkKnots'
import { Hint } from '../design/components'

/**
 * The scenes in the open file, and a way to get to one.
 *
 * An ink file is a list of knots with prose between them, and past a few
 * hundred lines the only way to find the scene you want is to scroll looking
 * for `===`. This is that list, kept beside the text.
 *
 * Read from the source on every change rather than from the compiler, and that
 * is the point rather than a shortcut: a file being edited spends much of its
 * life not compiling, and an outline that emptied itself every time a brace was
 * half-typed would be at its least useful exactly when the file is longest.
 * `scanKnots` needs only the header lines, which stay valid throughout.
 */

interface InkOutlineProps {
  source: string
  /**
   * The knot or stitch the cursor is in, as the editor reports it. Stitches
   * arrive as `knot.stitch`, which is how they are addressed.
   */
  here: string | null
  onGo: (line: number) => void
}

/**
 * Functions are left out.
 *
 * A function is called rather than travelled to, so it is not a place in the
 * story — and a table of contents listing it invites a click that would take
 * the author somewhere the reader can never be.
 */
function scenes(source: string): KnotRef[] {
  return scanKnots(source).filter((knot) => !knot.isFunction)
}

export function InkOutline({ source, here, onGo }: InkOutlineProps): React.JSX.Element {
  const found = useMemo(() => scenes(source), [source])

  return (
    <nav className="ink-outline" aria-label="Scenes in this file">
      <div className="ink-outline-label">Scenes</div>

      {found.length === 0 ? (
        <Hint tight>No knots yet. A file needs one before the story can divert into it.</Hint>
      ) : (
        <ul className="ink-outline-list">
          {found.map((knot) => (
            <li key={`${knot.line}:${knot.name}`}>
              <button
                type="button"
                className={`ink-outline-item${knot.isStitch ? ' is-stitch' : ''}${
                  knot.name === here ? ' is-here' : ''
                }`}
                // The line as well as the name: two knots may share a title
                // across files, and the number is what the author is looking
                // for when they are also reading a compiler error.
                title={`${knot.name} — line ${knot.line}`}
                aria-current={knot.name === here ? 'true' : undefined}
                onClick={() => onGo(knot.line)}
              >
                <span className="ink-outline-name">{knot.title}</span>
                <span className="ink-outline-line">{knot.line}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
