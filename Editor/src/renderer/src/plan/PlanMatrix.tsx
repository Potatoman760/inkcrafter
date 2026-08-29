import { useMemo } from 'react'
import type { CodexEntry } from '@shared/codex'
import { planMatrix } from '@shared/plan'
import type { PlanDocument } from '@shared/planDoc'
import { Button, Hint } from '../design/components'

interface PlanMatrixProps {
  plan: PlanDocument
  entries: CodexEntry[]
  onOpenEntry: (entryId: string) => void
}

/**
 * The character tracker: who appears where, across the whole story.
 *
 * Built from the same detection that decides what the model is told about, so a
 * blank row is a real answer — that character is named nowhere in the plan — and
 * not a gap in the tracking.
 */
export function PlanMatrix({ plan, entries, onOpenEntry }: PlanMatrixProps): React.JSX.Element {
  const matrix = useMemo(() => planMatrix(plan, entries), [plan, entries])

  if (matrix.chapters.length === 0) {
    return <Hint className="pad">Nothing planned yet.</Hint>
  }

  if (matrix.characters.length === 0) {
    return (
      <Hint className="pad">
        No characters are named in the plan yet. Mention a character in a chapter summary and
        they will appear here.
      </Hint>
    )
  }

  return (
    <div className="plan-matrix-wrap">
      <table className="plan-matrix">
        <thead>
          <tr>
            <th scope="col" className="plan-matrix-corner">
              Character
            </th>
            {matrix.chapters.map((chapter) => (
              <th scope="col" key={chapter.id} title={chapter.title}>
                <span>{chapter.title || 'untitled'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.characters.map((character) => (
            <tr key={character.id}>
              <th scope="row">
                <Button variant="link" onClick={() => onOpenEntry(character.id)}>
                  {character.name}
                </Button>
              </th>
              {matrix.chapters.map((chapter) => {
                const present = matrix.appearances.has(`${character.id}:${chapter.id}`)
                return (
                  <td
                    key={chapter.id}
                    className={present ? 'is-present' : ''}
                    aria-label={
                      present
                        ? `${character.name} appears in ${chapter.title}`
                        : `${character.name} does not appear in ${chapter.title}`
                    }
                  >
                    {present ? '●' : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
