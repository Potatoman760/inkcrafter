import { useMemo, useState } from 'react'
import { flattenPlan, planFromMarkdown, type PlanDocument } from '@shared/planDoc'
import { Button, Dialog, DialogSpacer, Field, Hint, Textarea } from '../design/components'

interface PlanImportDialogProps {
  /** Replaces the plan entirely; the caller confirms if there is one already. */
  onImport: (plan: PlanDocument) => void
  onClose: () => void
  hasExisting: boolean
}

const EXAMPLE = `# Act One

The situation, and what disturbs it.

## The door

She arrives at the archive after hours.

## Inside

The shelves, and the woman who keeps them.

# Act Two

The complication.`

/**
 * Bringing a plan in from markdown.
 *
 * The plan is the app's own document now, but an outline is usually drafted
 * somewhere else first — a notes app, a structure template, a chat. Heading
 * level becomes the hierarchy and the text beneath a heading its summary, which
 * is the convention those sources already follow.
 */
export function PlanImportDialog({
  onImport,
  onClose,
  hasExisting
}: PlanImportDialogProps): React.JSX.Element {
  const [text, setText] = useState('')
  const preview = useMemo(() => planFromMarkdown(text), [text])
  const count = flattenPlan(preview).length

  return (
    <Dialog
      title="Paste an outline"
      ariaLabel="Import an outline"
      className="entry-dialog"
      onClose={onClose}
      footer={
        <>
          {/* Destructive far left, then the way out, then the commit. */}
          <DialogSpacer />
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={count === 0}
            onClick={() => {
              if (hasExisting && !window.confirm('Replace the current plan with this outline?')) {
                return
              }
              onImport(preview)
              onClose()
            }}
          >
            Import
          </Button>
        </>
      }
    >
      <Hint tight>
        A large heading is an act, a smaller one a chapter, and the text beneath each is its
        summary. <code>status:</code> and <code>tags:</code> lines directly under a heading are
        read as fields.
      </Hint>

      <Field label="Outline">
        <Textarea
          rows={14}
          value={text}
          placeholder={EXAMPLE}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>

      {count === 0 ? (
        <Hint tight>Nothing to import yet.</Hint>
      ) : (
        <p className="write-target">
          {`${count} section${count === 1 ? '' : 's'}: ${preview.nodes
            .map((node) => node.title || 'untitled')
            .join(' · ')}`}
        </p>
      )}

      {hasExisting && count > 0 && (
        <p className="codex-warning">
          This replaces the plan you already have. Nothing else is touched.
        </p>
      )}
    </Dialog>
  )
}
