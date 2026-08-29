import { useEffect, useMemo, useState } from 'react'
import type { WriteInkResult } from '@shared/ai'
import type { CodexEntry } from '@shared/codex'
import { selectCodexEntries } from '@shared/codexContext'
import { planContextForFile } from '@shared/plan'
import type { PlanDocument } from '@shared/planDoc'
import type { Project } from '@shared/project'
import { InstructionInput } from '../manuscript/InstructionInput'
import { ModelPicker } from '../settings/ModelPicker'
import { useSettings } from '../settings/useSettings'
import { Button, Chip, ChipRow, Field, Hint, Textarea } from '../design/components'
import { copy } from '@shared/copy'

interface InkWritePanelProps {
  project: Project
  /** Project-relative path of the open file. */
  filePath: string | null
  /** The buffer as it stands, unsaved edits included. */
  source: string
  /** What is selected in the editor, which the draft would replace. */
  selection: string
  codexEntries: CodexEntry[]
  plan: PlanDocument
  onInsert: (text: string) => void
}

/**
 * Drafting ink, beside the editor.
 *
 * The counterpart to the manuscript's write panel, and the opposite request: the
 * model writes *structure* here — choices, diverts, knots — so there is no word
 * limit, which would only be a number to ignore when the useful answer might be
 * three lines of choice or a whole knot.
 *
 * It is a builder rather than a box: what will be sent is listed before it is
 * sent. The context is narrow on purpose — this file, the codex entries named in
 * it, and what the plan says the file is for — because a model given the whole
 * story writes to the whole story.
 */
export function InkWritePanel({
  project,
  filePath,
  source,
  selection,
  codexEntries,
  plan,
  onInsert
}: InkWritePanelProps): React.JSX.Element {
  const settings = useSettings(true)

  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [instruction, setInstruction] = useState('')
  const [result, setResult] = useState<WriteInkResult | null>(null)
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (providerId || settings.settings.providers.length === 0) return
    const active =
      settings.settings.providers.find((p) => p.id === settings.settings.activeProviderId) ??
      settings.settings.providers[0]!
    setProviderId(active.id)
    setModel(active.model)
  }, [settings.settings, providerId])

  const provider = settings.settings.providers.find((candidate) => candidate.id === providerId)

  // The same selection the main process will make when it builds the prompt —
  // shared code rather than a second implementation, so what is listed here
  // cannot drift from what is actually sent.
  const codex = useMemo(
    () => selectCodexEntries([source, selection, instruction].join('\n\n'), codexEntries),
    [source, selection, instruction, codexEntries]
  )

  const planContext = useMemo(
    () => (filePath ? planContextForFile(plan, filePath) : null),
    [plan, filePath]
  )

  const ready = Boolean(provider && model && filePath)

  const generate = async (): Promise<void> => {
    if (!ready || !filePath) return
    setBusy(true)
    setResult(null)

    try {
      const outcome = await window.inkcrafter.ai.writeInk(
        { filePath, source, instruction, selection, providerId, model },
        project
      )
      setResult(outcome)
      if (outcome.ok) {
        setDraft(outcome.text)
        setDrafting(true)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!filePath) {
    return <Hint className="pad">Open an ink file to draft into it.</Hint>
  }

  return (
    <div className="write-panel">
      <Field as="div" label="Model">
        {provider ? (
          <ModelPicker
            providerId={provider.id}
            baseUrl={provider.baseUrl}
            value={model}
            onChange={setModel}
            listModels={window.inkcrafter.settings.listModels}
          />
        ) : (
          <p className="codex-error">No AI provider configured. Add one in Settings.</p>
        )}
      </Field>

      {/* The builder: everything below is what will be sent, before it is. */}
      <Field as="div" label="Context" about={copy('inkWrite.context')}>
        <ul className="ink-context">
          <li>
            <strong>{filePath}</strong> — the whole file
          </li>

          <li>
            {selection.trim().length > 0 ? (
              <>
                <strong>Your selection</strong> — {selection.trim().split(/\s+/).length} words, which
                the draft would replace
              </>
            ) : (
              <span className="is-absent">Nothing selected — the draft goes in at the cursor</span>
            )}
          </li>

          <li>
            {planContext ? (
              <>
                <strong>{planContext.ancestry.map((node) => node.title).join(' › ')}</strong> — the{' '}
                {planContext.role} this file is for
                {planContext.node.children.length > 0 &&
                  `, and its ${planContext.node.children.length} sections`}
              </>
            ) : (
              <span className="is-absent">Not attached to anything in the plan</span>
            )}
          </li>

          <li>
            {codex.entries.length > 0 ? (
              <>
                <strong>{codex.entries.length} codex entries</strong>
                <ChipRow>
                  {codex.entries.map((entry) => (
                    <Chip
                      key={entry.id}
                      variant={codex.detected.has(entry.id) ? 'detected' : 'default'}
                    >
                      {entry.name}
                    </Chip>
                  ))}
                </ChipRow>
              </>
            ) : (
              <span className="is-absent">No codex entries recognised in this file</span>
            )}
          </li>
        </ul>
      </Field>

      <Field label="Instruction" about={copy('inkWrite.instruction')}>
        <InstructionInput
          value={instruction}
          onChange={setInstruction}
          entries={codexEntries}
          placeholder="Write two choices here — one that trusts Mara, one that does not."
        />
      </Field>

      <div className="detail-row">
        <Button variant="primary" onClick={() => void generate()} disabled={!ready || busy}>
          {busy ? 'Writing…' : 'Write ink'}
        </Button>
      </div>

      {result && !result.ok && <p className="codex-error">{result.message}</p>}

      {drafting && (
        <div className="draft">
          <div className="draft-head">
            {/* ic-field exception: a label with a status pushed to the far
                right of the row. Field's note sits directly after the label
                text, and no other component pairs a label with a state. */}
            <span className="ic-field__label">Draft</span>
            {result?.compiles ? (
              <span className="draft-compiles">compiles where it would go</span>
            ) : (
              result?.compileError && <span className="draft-broken">does not compile</span>
            )}
          </div>

          {/* Reported, not enforced. A draft that does not compile is usually
              still most of what was wanted, and the author can fix it faster
              than the model can. */}
          {result?.compileError && <p className="codex-error">{result.compileError}</p>}

          <Textarea
            rows={14} className="draft-ink"
            value={draft}
            aria-label="Drafted ink"
            onChange={(event) => setDraft(event.target.value)}
          />

          <div className="detail-row">
            <Button variant="primary"
              onClick={() => onInsert(draft)}
              disabled={draft.trim().length === 0}
            >
              {selection.trim().length > 0 ? 'Replace selection' : 'Insert at cursor'}
            </Button>
            <Button onClick={() => void navigator.clipboard.writeText(draft)}>Copy</Button>
            <Button variant="link"
              onClick={() => {
                setDrafting(false)
                setDraft('')
                setResult(null)
              }}
            >
              discard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
