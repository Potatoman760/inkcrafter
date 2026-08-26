import type { JunctionNode, SourceAnchor } from '@shared/manuscript'
import { EditableLine } from './EditableLine'

interface JunctionCardProps {
  junction: JunctionNode
  /** Ordinal within the manuscript, for a readable label. */
  ordinal: number
  onChoose: (nodeId: string, choiceIndex: number) => void
  onEdit: (nodeId: string, choiceIndex: number, text: string) => void
  onOpenSource: (anchor: SourceAnchor) => void
}

/**
 * A junction shown in place in the prose.
 *
 * Every option is listed, not just the one taken — the point of the view is to
 * see the shape of the story, and a branch you cannot see is one you cannot
 * reconsider. Choosing again here discards everything that followed, because
 * that text described a path no longer taken.
 */
export function JunctionCard({
  junction,
  ordinal,
  onChoose,
  onEdit,
  onOpenSource
}: JunctionCardProps): React.JSX.Element {
  const pending = junction.chosenIndex === null

  return (
    <div className={`junction ${pending ? 'is-pending' : ''}`} id={`junction-${junction.id}`}>
      <div className="junction-header">
        <span className="junction-label">Choice {ordinal}</span>
        {pending ? (
          <span className="junction-hint">pick one to continue</span>
        ) : (
          <span className="junction-hint">
            choosing again discards everything below
          </span>
        )}
      </div>

      <ul className="junction-options">
        {junction.choices.map((choice) => {
          const chosen = choice.index === junction.chosenIndex
          return (
            <li key={choice.index}>
              <button
                // ic-row exception: the row holds an EditableLine, so the
                // button is not the whole row and ListRow's name slot cannot
                // hold it. `is-chosen` is not a selection either — it marks
                // the branch the reader took.
                className={`ic-row junction-option ${chosen ? 'is-chosen' : ''}`}
                onClick={() => onChoose(junction.id, choice.index)}
                disabled={chosen}
              >
                <span className="junction-marker" aria-hidden="true">
                  {chosen ? '▸' : ''}
                </span>
                <EditableLine
                  text={choice.text}
                  edit={choice.edit}
                  className="junction-text"
                  onSave={(text) => onEdit(junction.id, choice.index, text)}
                >
                  {choice.text}
                </EditableLine>
              </button>
              {choice.source && (
                <button
                  className="source-link"
                  title={`${choice.source.file}:${choice.source.line}`}
                  onClick={() => onOpenSource(choice.source!)}
                >
                  {choice.source.line}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
