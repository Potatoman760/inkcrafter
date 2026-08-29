import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '@shared/project'
import type { SearchHit, SearchResult } from '@shared/types'
import { Checkbox, Hint } from '../design/components'

interface SearchDialogProps {
  project: Project
  /** Opens the file and puts the line at the top of the editor. */
  onOpen: (file: string, line: number) => void
  onClose: () => void
}

/** How long after the last keystroke to ask, so typing a word is one search. */
const SETTLE_MS = 180

/**
 * Finding text anywhere in the project's ink.
 *
 * An overlay rather than a rail tab because opening a result hands the left
 * rail to the file tree, which would pull a rail-mounted result list out from
 * under the author mid-jump. So it closes on the way through: you search, you
 * land, the dialog is gone.
 *
 * Double-click opens, as asked. Arrow keys and Enter do the same thing from the
 * search field, which is the only way through this for anyone not using a
 * mouse — the row is reachable but a double-click is not a keystroke.
 *
 * It wears the command palette's shell rather than `Dialog`'s. Two reasons, and
 * the inline exceptions below are the short form of them: `Dialog`'s own rule
 * sends anything used *while writing* out of a dialog, and this is the same
 * gesture as the palette — type, arrow down, Enter, land somewhere — aimed at
 * prose instead of commands. An author should not have to learn it twice.
 */
export function SearchDialog({ project, onOpen, onClose }: SearchDialogProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [index, setIndex] = useState(0)

  /**
   * Which search the arriving answer belongs to.
   *
   * Typing "maren" fires several searches and they need not come back in
   * order; without this, a slower answer for "mar" can land after the answer
   * for "maren" and replace it.
   */
  const asked = useRef(0)

  useEffect(() => {
    const mine = (asked.current += 1)
    const timer = setTimeout(() => {
      void window.inkcrafter.search
        .ink(project, { query, caseSensitive, regex })
        .then((next) => {
          if (asked.current === mine) {
            setResult(next)
            setIndex(0)
          }
        })
    }, SETTLE_MS)

    return () => clearTimeout(timer)
  }, [project, query, caseSensitive, regex])

  const hits = useMemo(() => result?.hits ?? [], [result])

  /** Hits under their file, in the order they came back. */
  const groups = useMemo(() => {
    const byFile: { file: string; hits: SearchHit[] }[] = []
    for (const hit of hits) {
      const last = byFile[byFile.length - 1]
      if (last && last.file === hit.file) last.hits.push(hit)
      else byFile.push({ file: hit.file, hits: [hit] })
    }
    return byFile
  }, [hits])

  const open = (hit: SearchHit): void => {
    onOpen(hit.file, hit.line)
    onClose()
  }

  const rowRef = useRef<HTMLButtonElement>(null)

  // A block body, not a concise one. `scrollIntoView` returns a value, and an
  // effect that returns anything but a function hands React that value as the
  // clean-up to call on unmount — which threw as soon as the dialog closed
  // after a row had been selected.
  useEffect(() => {
    rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [index])

  let at = -1

  // ic-scrim exception: the palette's backdrop, so this sits at the same depth
  // and dismisses the same way.
  return (
    <div
      className="ic-scrim"
      style={{ alignItems: 'flex-start', paddingTop: '12vh' }}
      onMouseDown={onClose}
    >
      {/* ic-palette exception: the palette's shell, which is not exported apart
          from `CommandPalette` and its command list. See above. */}
      <div
        className="ic-palette search-find"
        role="dialog"
        aria-modal="true"
        aria-label="Find in files"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* ic-palette exception: the palette's own field, so both overlays take a query identically. */}
        <input
          autoFocus
          className="ic-palette__input"
          aria-label="Find in ink files"
          placeholder="Find in ink files…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIndex((was) => Math.min(was + 1, hits.length - 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setIndex((was) => Math.max(was - 1, 0))
            }
            if (event.key === 'Enter') {
              const hit = hits[index]
              if (hit) open(hit)
            }
            if (event.key === 'Escape') onClose()
          }}
        />

        <div className="search-find__options">
          <Checkbox
            label="Match case"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.target.checked)}
          />
          <Checkbox
            label="Regular expression"
            checked={regex}
            onChange={(event) => setRegex(event.target.checked)}
          />
          <span className="search-find__count">
            {result === null || query.length === 0
              ? ''
              : hits.length === 0
                ? 'No matches'
                : `${hits.length}${result.capped ? '+' : ''} in ${groups.length} file${groups.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {result?.problem !== null && result?.problem !== undefined && (
          <Hint tight>{result.problem}</Hint>
        )}
        {result?.capped === true && (
          <Hint tight>Showing the first {hits.length}. Narrow the search to see the rest.</Hint>
        )}

        <div className="search-find__results">
          {groups.map((group) => (
            <div key={group.file} className="search-find__group">
              <div className="search-find__file">
                <span>{group.file}</span>
                <span className="search-find__tally">{group.hits.length}</span>
              </div>
              {group.hits.map((hit) => {
                at += 1
                const here = at
                const head = hit.preview.slice(0, hit.column)
                const match = hit.preview.slice(hit.column, hit.column + hit.length)
                const tail = hit.preview.slice(hit.column + hit.length)

                return (
                  <button
                    key={`${hit.file}:${hit.line}:${hit.column}`}
                    ref={here === index ? rowRef : undefined}
                    type="button"
                    className={`search-find__hit${here === index ? ' is-current' : ''}`}
                    onClick={() => setIndex(here)}
                    onDoubleClick={() => open(hit)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        open(hit)
                      }
                    }}
                  >
                    <span className="search-find__at">{hit.line}</span>
                    <span className="search-find__text">
                      {head}
                      <mark>{match}</mark>
                      {tail}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
