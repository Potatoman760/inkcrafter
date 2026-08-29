import { useEffect, useState } from 'react'
import { inkName } from '@shared/statsDoc'
import type { NameUse } from '@shared/types'
import { Button, Field, Hint, Input } from '../design/components'
import { copy } from '@shared/copy'

interface NameFieldProps {
  /** The committed name; the field resets to it when the selection changes. */
  value: string
  /** Why a candidate cannot be used, or null. Run against the typed text. */
  problem: (candidate: string) => string | null
  /** Where the current name is used, so a rename can say what it breaks. */
  uses: NameUse[]
  onCommit: (name: string) => void
  onOpenUse: (use: NameUse) => void
}

/**
 * The ink identifier, editable.
 *
 * Held locally and committed on blur rather than on every keystroke, because
 * committing mid-word would rename the entry to a prefix, regenerate the ink,
 * and then do it again on the next letter — a hundred saves for one rename.
 *
 * The uses list is the honest part. Ink already written against the old name
 * stops compiling, and the app cannot yet safely rewrite it — telling `shovel`
 * in a condition from "shovel" in a sentence needs a parser this does not have.
 * So it says exactly where to look instead of pretending the rename is free.
 */
export function NameField({
  value,
  problem,
  uses,
  onCommit,
  onOpenUse
}: NameFieldProps): React.JSX.Element {
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  const cleaned = inkName(draft)
  const changed = cleaned !== value
  const trouble = changed ? problem(draft) : null

  const commit = (): void => {
    if (!changed || trouble) {
      setDraft(value)
      return
    }
    onCommit(cleaned)
  }

  return (
    <Field label="Name" about={copy('stats.inkName')}>
      <Input className="stats-name-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(value)
            event.currentTarget.blur()
          }
        }}
      />

      {trouble ? (
        <p className="codex-error">{trouble}</p>
      ) : (
        changed && (
          <Hint tight>
            will be renamed to <code>{cleaned}</code>
          </Hint>
        )
      )}

      {uses.length > 0 && (
        <div className="name-uses">
          <Hint tight>
            <code>{value}</code> is used in {uses.length} place{uses.length === 1 ? '' : 's'}.
            Renaming here will not change them.
          </Hint>
          <ul>
            {uses.slice(0, 8).map((use) => (
              <li key={`${use.path}:${use.line}`}>
                <Button variant="link" onClick={() => onOpenUse(use)}>
                  {use.path}:{use.line}
                </Button>
                <code>{use.text.slice(0, 60)}</code>
              </li>
            ))}
          </ul>
          {uses.length > 8 && <Hint tight>…and {uses.length - 8} more.</Hint>}
        </div>
      )}
    </Field>
  )
}
