import { CODEX_TYPE_LABELS, type CodexEntry } from '@shared/codex'
import { Button, Hint } from '../design/components'

interface CodexEntrySummaryProps {
  entry: CodexEntry
  libraryTitle: string
  mentionCount: number
  onEdit: () => void
}

/**
 * The selected entry at a glance, in the codex sidebar.
 *
 * *At a glance* is the whole of it. This is a narrow column beside a list you
 * are still using, so it says what an entry is called and what it answers to —
 * the names the app detects in your prose — and stops. A character's whole
 * description belongs in the editor, where there is room to read it, not
 * squeezed into a sidebar and pushing the rest of the list off the bottom.
 *
 * Read-only on purpose: editing happens in a dialog, so there is exactly one
 * place an entry can be changed and no question about which copy is current.
 */
export function CodexEntrySummary({
  entry,
  libraryTitle,
  mentionCount,
  onEdit
}: CodexEntrySummaryProps): React.JSX.Element {
  return (
    <div className="entry-summary">
      <div className="entry-header">
        <span className="entry-name">{entry.name}</span>
        <Button onClick={onEdit}>Edit</Button>
      </div>

      <p className="entry-mentions">
        {CODEX_TYPE_LABELS[entry.type]} · {libraryTitle} · {mentionCount} mention
        {mentionCount === 1 ? '' : 's'} across the story
      </p>

      {entry.aliases.length > 0 && (
        <p className="summary-line">
          <span className="summary-label">Also</span> {entry.aliases.join(', ')}
        </p>
      )}

      {entry.tags.length > 0 && (
        <p className="summary-line">
          <span className="summary-label">Tags</span> {entry.tags.join(', ')}
        </p>
      )}

      {!entry.tracking.byName && (
        <Hint tight>Not tracked by name, so it is never detected in the story.</Hint>
      )}
    </div>
  )
}
