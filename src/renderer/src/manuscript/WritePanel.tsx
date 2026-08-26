import { useEffect, useMemo, useState } from 'react'
import { WORD_LIMITS, type WordLimit } from '@shared/ai'
import type { CodexEntry } from '@shared/codex'
import { scanTextFor, selectCodexEntries } from '@shared/codexContext'
import { sectionsOf, type Manuscript } from '@shared/manuscript'
import { InstructionInput } from './InstructionInput'
import { ModelPicker } from '../settings/ModelPicker'
import { useSettings } from '../settings/useSettings'
import type { ManuscriptSession } from './useManuscript'
import {
  Button,
  Chip,
  ChipRow,
  Field,
  Hint,
  Segmented,
  Select,
  Textarea
} from '../design/components'
import { copy } from '@shared/copy'

interface WritePanelProps {
  manuscript: Manuscript
  session: ManuscriptSession
  /** The section the author clicked, or null. */
  sectionIndex: number | null
  codexEntries: CodexEntry[]
}

export function WritePanel({
  manuscript,
  session,
  sectionIndex,
  codexEntries
}: WritePanelProps): React.JSX.Element {
  const settings = useSettings(true)

  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [maxWords, setMaxWords] = useState<WordLimit>(400)
  const [instruction, setInstruction] = useState('')
  const [draft, setDraft] = useState('')
  // Separate from the text, so that clearing the box to retype does not take
  // the review controls away with it.
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [replaceable, setReplaceable] = useState<{ safe: boolean; reason: string | null } | null>(null)

  // The default provider and model come from settings; the pickers here only
  // override them for this draft.
  useEffect(() => {
    if (providerId || settings.settings.providers.length === 0) return
    const active =
      settings.settings.providers.find((p) => p.id === settings.settings.activeProviderId) ??
      settings.settings.providers[0]!
    setProviderId(active.id)
    setModel(active.model)
  }, [settings.settings, providerId])

  const provider = settings.settings.providers.find((candidate) => candidate.id === providerId)
  const sections = sectionsOf(manuscript)
  // The index can outlive the manuscript it came from — switching to the editor
  // empties the reading, and the old index then points past the end. Indexing
  // past an array yields undefined, not null, so this has to be a truthiness
  // check rather than a comparison against null.
  const section = sectionIndex === null ? null : (sections[sectionIndex] ?? null)

  // The same selection the main process will make when it builds the prompt —
  // shared code rather than a second implementation, so the preview cannot
  // drift from what is actually sent.
  const selection = useMemo(
    () =>
      sectionIndex === null
        ? { entries: [], detected: new Set<string>() }
        : selectCodexEntries(scanTextFor(manuscript, sectionIndex, instruction), codexEntries),
    [manuscript, sectionIndex, instruction, codexEntries]
  )

  // Whether the section can be overwritten is a property of its source lines,
  // so it is asked of the main process rather than guessed here.
  useEffect(() => {
    if (sectionIndex === null) {
      setReplaceable(null)
      return
    }
    let cancelled = false
    void window.inkcrafter.manuscript
      .sectionReplaceable(sectionIndex)
      .then((result) => {
        if (!cancelled) setReplaceable(result)
      })
      .catch(() => {
        if (!cancelled) setReplaceable(null)
      })
    return () => {
      cancelled = true
    }
  }, [sectionIndex, manuscript])

  const generate = async (): Promise<void> => {
    if (sectionIndex === null || section === null) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.inkcrafter.ai.writeSection({
        sectionIndex,
        instruction,
        maxWords,
        providerId,
        model
      })
      if (result.ok) {
        setDraft(result.text)
        setDrafting(true)
      } else {
        setMessage(result.message)
      }
    } finally {
      setBusy(false)
    }
  }

  const apply = async (mode: 'insert' | 'replace'): Promise<void> => {
    if (sectionIndex === null) return
    setBusy(true)
    const error = await session.compose(sectionIndex, mode, draft)
    setBusy(false)
    setMessage(error)
    if (!error) {
      setDraft('')
      setDrafting(false)
    }
  }

  if (settings.settings.providers.length === 0) {
    return (
      <div className="write-panel">
        <Hint>
          No AI provider is configured yet. Add one under Settings, then come back.
        </Hint>
      </div>
    )
  }

  return (
    <div className="write-panel">
      {section === null || sectionIndex === null ? (
        <Hint>
          Click a paragraph in the manuscript to choose the section to write.
        </Hint>
      ) : (
        <p className="write-target">
          Section {sectionIndex + 1} of {sections.length} ·{' '}
          {section.nodes.length === 0
            ? 'empty'
            : `${section.nodes.reduce((n, node) => n + node.text.split(/\s+/).length, 0)} words`}
        </p>
      )}

      <Field label="Provider">
        <Select
          value={providerId}
          onChange={(event) => {
            setProviderId(event.target.value)
            const next = settings.settings.providers.find((p) => p.id === event.target.value)
            setModel(next?.model ?? '')
          }}
        >
          {settings.settings.providers.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </Select>
      </Field>

      {provider && (
        <Field as="div" label="Model" about={copy('write.model')}>
          <ModelPicker
            providerId={provider.id}
            baseUrl={provider.baseUrl}
            value={model}
            onChange={setModel}
            listModels={settings.listModels}
          />
        </Field>
      )}

      <Field as="div" label="Length">
        <Segmented
          className="word-limits"
          label="Length"
          options={WORD_LIMITS.map((limit) => ({ value: String(limit), label: String(limit) }))}
          value={String(maxWords)}
          onChange={(value) => setMaxWords(Number(value) as (typeof WORD_LIMITS)[number])}
        />
      </Field>

      <Field label="Instruction" about={copy('write.instruction')}>
        <InstructionInput
          value={instruction}
          onChange={setInstruction}
          entries={codexEntries}
          placeholder="She finds the ledger open at a page she was not meant to see."
        />
      </Field>

      <Field as="div" label="Codex sent with it" about={copy('write.codex')}>
        {selection.entries.length === 0 ? (
          <Hint tight>
            Nothing recognised. Name a character or place, or set an entry to always.
          </Hint>
        ) : (
          <ChipRow>
            {selection.entries.map((selected) => (
              <Chip
                key={selected.id}
                variant={selection.detected.has(selected.id) ? 'detected' : 'default'}
                title={
                  selection.detected.has(selected.id)
                    ? 'Named in the text'
                    : 'Always sent, or related to something named'
                }
              >
                {selected.name}
              </Chip>
            ))}
          </ChipRow>
        )}
      </Field>

      <Button onClick={() => void generate()} disabled={busy || section === null}>
        {busy ? 'Writing…' : 'Draft this section'}
      </Button>

      {message && <p className="codex-error">{message}</p>}

      {drafting && (
        <div className="draft">
          <Field as="div" label="Draft" about={copy('write.draft')}>
            <Textarea rows={12} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </Field>

          <div className="detail-row">
            <Button onClick={() => void apply('insert')} disabled={busy || draft.trim().length === 0}>
              Insert after
            </Button>
            <Button
              onClick={() => void apply('replace')}
              disabled={busy || draft.trim().length === 0 || !replaceable?.safe}
              title={replaceable?.reason ?? 'Replace the section'}
            >
              Replace section
            </Button>
            <Button variant="link"
              onClick={() => {
                setDraft('')
                setDrafting(false)
              }}
            >
              discard
            </Button>
          </div>

          {replaceable && !replaceable.safe && (
            <Hint tight>{replaceable.reason}</Hint>
          )}
        </div>
      )}
    </div>
  )
}
