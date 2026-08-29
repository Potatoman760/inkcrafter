import type { Manuscript } from '@shared/manuscript'
import type { ProjectFile } from '@shared/project'
import { Icon } from '../design/Icon'
import { Button, Field, Hint, Select } from '../design/components'
import { copy } from '@shared/copy'

interface ManuscriptOutlineProps {
  manuscript: Manuscript
  files: ProjectFile[]
  entryPath: string | null
  onChangeEntry: (path: string) => void
  onReload: () => void
}

/**
 * The shape of the reading: which knots it passes through and where the
 * junctions are. In a story long enough to be worth this view, scrolling is not
 * navigation.
 */
export function ManuscriptOutline({
  manuscript,
  files,
  entryPath,
  onChangeEntry,
  onReload
}: ManuscriptOutlineProps): React.JSX.Element {
  const junctions = manuscript.nodes.filter((node) => node.kind === 'junction')

  const jumpTo = (nodeId: string): void => {
    document.getElementById(`junction-${nodeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="outline">
      <Field label="Read from" about={copy('manuscript.readFrom')}>
        <Select value={entryPath ?? ''} onChange={(event) => onChangeEntry(event.target.value)}>
          {files.map((file) => (
            <option key={file.path} value={file.path}>
              {file.path}
            </option>
          ))}
        </Select>
      </Field>

      <Button onClick={onReload}><Icon name="rotate-ccw" size={13} />Recompile and reread</Button>
      <Hint tight>
        The manuscript reads the saved file. Rereading recompiles it and puts you back on the
        same path, as far as the edited story still allows.
      </Hint>

      <Field as="div" label="Junctions">
        {junctions.length === 0 && <Hint>None yet.</Hint>}
        {junctions.map((junction, index) => {
          if (junction.kind !== 'junction') return null
          const chosen =
            junction.chosenIndex === null
              ? null
              : junction.choices.find((choice) => choice.index === junction.chosenIndex)
          return (
            <button
              key={junction.id}
              // ic-row exception: a leading index number, which ListRow's
              // icon slot only takes a glyph for.
              className={`ic-row outline-item ${chosen ? '' : 'is-pending'}`}
              onClick={() => jumpTo(junction.id)}
            >
              <span className="outline-index">{index + 1}</span>
              <span className="outline-text">{chosen ? chosen.text : 'awaiting a choice'}</span>
            </button>
          )
        })}
      </Field>
    </div>
  )
}
