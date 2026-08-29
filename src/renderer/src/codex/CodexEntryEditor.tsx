import { useEffect, useState } from 'react'
import {
  CODEX_TYPE_LABELS,
  slugifyPath,
  type AiContext,
  type CodexDetail,
  type CodexEntry
} from '@shared/codex'
import { Button, Checkbox, Field, Hint, Input, Select, Tabs } from '../design/components'
import { copy } from '@shared/copy'
import { CodexTextarea } from './CodexTextarea'

interface CodexEntryEditorProps {
  entry: CodexEntry
  /** Every entry the project can see, for the relation picker. */
  entries: CodexEntry[]
  /** Title of the library this entry belongs to. */
  libraryTitle: string
  mentionCount: number
  onChange: (entry: CodexEntry) => void
  onMove: (entry: CodexEntry, toFile: string) => void
}

type Tab = 'details' | 'relations' | 'tracking' | 'notes'

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'relations', label: 'Relations' },
  { id: 'tracking', label: 'Tracking' },
  { id: 'notes', label: 'Notes' }
]

const AI_CONTEXT_OPTIONS: ReadonlyArray<{ value: AiContext; label: string }> = [
  { value: 'detected', label: 'When mentioned' },
  { value: 'always', label: 'Always' },
  { value: 'never', label: 'Never' }
]

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/**
 * A comma-separated list bound to a string[].
 *
 * It keeps its own text so that a half-typed "Wren, " survives a re-render with
 * its trailing comma intact, while the parsed value propagates on every change.
 */
function ListField({
  label,
  hint,
  value,
  resetKey,
  onChange
}: {
  label: string
  hint?: string
  value: string[]
  resetKey: string
  onChange: (next: string[]) => void
}): React.JSX.Element {
  const [text, setText] = useState(value.join(', '))

  // Re-sync only when switching entries, not on every keystroke round-trip.
  useEffect(() => setText(value.join(', ')), [resetKey])

  return (
    <Field label={label} note={hint}>
      <Input
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          onChange(splitList(event.target.value))
        }}
      />
    </Field>
  )
}

export function CodexEntryEditor({
  entry,
  entries,
  libraryTitle,
  mentionCount,
  onChange,
  onMove
}: CodexEntryEditorProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('details')
  const [fileDraft, setFileDraft] = useState(entry.file)

  useEffect(() => setFileDraft(entry.file), [entry.id, entry.file])

  const patch = (changes: Partial<CodexEntry>): void => onChange({ ...entry, ...changes })

  const patchDetail = (index: number, changes: Partial<CodexDetail>): void => {
    patch({
      details: entry.details.map((detail, position) =>
        position === index ? { ...detail, ...changes } : detail
      )
    })
  }

  const others = entries.filter((candidate) => candidate.id !== entry.id)

  return (
    <div className="entry-editor">
      <div className="entry-header">
        <Input className="entry-name"
          value={entry.name}
          onChange={(event) => patch({ name: event.target.value })}
        />
        <span className="entry-type" aria-label="Entry type">
          {CODEX_TYPE_LABELS[entry.type]}
        </span>
      </div>

      <p className="entry-mentions">
        {mentionCount} mention{mentionCount === 1 ? '' : 's'} across the story · {libraryTitle}
      </p>

      <Tabs
        className="entry-tabs"
        level="sub"
        label="Entry"
        value={tab}
        onChange={(next) => setTab(next as Tab)}
        items={TABS.map((candidate) => ({ value: candidate.id, label: candidate.label }))}
      />

      <div className="entry-body">
        {tab === 'details' && (
          <>
            <ListField
              label="Aliases"
              hint={copy('codex.tags')}
              value={entry.aliases}
              resetKey={entry.id}
              onChange={(aliases) => patch({ aliases })}
            />
            <ListField
              label="Tags"
              hint={copy('codex.aliases')}
              value={entry.tags}
              resetKey={entry.id}
              onChange={(tags) => patch({ tags })}
            />

            {entry.type === 'character' && (
              <Field label="Appearance" about={copy('codex.appearance')}>
                <CodexTextarea
                  rows={5}
                  value={entry.appearance}
                  onChange={(event) => patch({ appearance: event.target.value })}
                />
              </Field>
            )}

            <Field label="Description" about={copy('codex.description')}>
              <CodexTextarea
                data-codex-find="description"
                rows={10}
                value={entry.description}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </Field>

            <Field
              as="div"
              className="detail-list"
              label="Details"
              about={copy('codex.fields')}
            >
              {entry.details.map((detail, index) => (
                <div className="detail" key={index}>
                  <div className="detail-row">
                    <Input className="detail-label"
                      placeholder="Label"
                      value={detail.label}
                      onChange={(event) => patchDetail(index, { label: event.target.value })}
                    />
                    <Select
                      value={detail.ai}
                      onChange={(event) =>
                        patchDetail(index, { ai: event.target.value as AiContext })
                      }
                    >
                      {AI_CONTEXT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <Button variant="link"
                      onClick={() =>
                        patch({ details: entry.details.filter((_, position) => position !== index) })
                      }
                    >
                      remove
                    </Button>
                  </div>
                  <CodexTextarea
                    rows={2}
                    value={detail.value}
                    onChange={(event) => patchDetail(index, { value: event.target.value })}
                  />
                </div>
              ))}

              <Button
                onClick={() =>
                  patch({ details: [...entry.details, { label: '', value: '', ai: 'always' }] })
                }
              >
                Add detail
              </Button>
            </Field>
          </>
        )}

        {tab === 'relations' && (
          <>
            <Hint tight>
              Related entries are pulled in alongside this one, so keep it to entries that truly
              travel together — a tavern and its barkeep, not everyone who has ever visited.
            </Hint>
            {others.length === 0 && <Hint>No other entries yet.</Hint>}
            {others.map((other) => (
              <Checkbox
                key={other.id}
                className="checkbox"
                label={other.name}
                trail={<span className="checkbox-type">{CODEX_TYPE_LABELS[other.type]}</span>}
                checked={entry.relations.includes(other.id)}
                onChange={(event) =>
                  patch({
                    relations: event.target.checked
                      ? [...entry.relations, other.id]
                      : entry.relations.filter((id) => id !== other.id)
                  })
                }
              />
            ))}
          </>
        )}

        {tab === 'tracking' && (
          <>
            <Checkbox
              className="checkbox"
              label="Track this entry by name and aliases"
              checked={entry.tracking.byName}
              onChange={(event) =>
                patch({ tracking: { ...entry.tracking, byName: event.target.checked } })
              }
            />

            <Checkbox
              className="checkbox"
              label="Case sensitive"
              checked={entry.tracking.caseSensitive}
              onChange={(event) =>
                patch({ tracking: { ...entry.tracking, caseSensitive: event.target.checked } })
              }
            />
            <Hint tight>
              Worth switching on when the name is also an ordinary word — a character called Red,
              a location called Storm.
            </Hint>

            <ListField
              label="Exclusions"
              hint={copy('codex.notAliases')}
              value={entry.tracking.exclusions}
              resetKey={entry.id}
              onChange={(exclusions) => patch({ tracking: { ...entry.tracking, exclusions } })}
            />

            <Field label="AI context" about={copy('codex.aiContext')}>
              <Select
                value={entry.aiContext}
                onChange={(event) => patch({ aiContext: event.target.value as AiContext })}
              >
                {AI_CONTEXT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="File" note={`${fileDraft || '…'}.md`}>
              <div className="detail-row">
                <Input
                  value={fileDraft}
                  placeholder="characters/wren"
                  onChange={(event) => setFileDraft(slugifyPath(event.target.value))}
                />
                <Button
                  disabled={fileDraft === entry.file || fileDraft.length === 0}
                  onClick={() => onMove(entry, fileDraft)}
                >
                  Move
                </Button>
              </div>
            </Field>
            <Hint tight>
              Include slashes to file the entry in folders. Moving it changes nothing else —
              relations point at the entry's id, not its location.
            </Hint>

            <Field label="Id" about={copy('codex.id')}>
              <Input value={entry.id} readOnly />
            </Field>

          </>
        )}

        {tab === 'notes' && (
          <Field label="Notes" about={copy('codex.notes')}>
            <CodexTextarea
              rows={16}
              value={entry.notes}
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </Field>
        )}
      </div>
    </div>
  )
}
