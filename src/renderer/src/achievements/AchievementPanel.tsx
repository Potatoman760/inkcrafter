import { useEffect, useMemo, useState } from 'react'
import {
  ACHIEVEMENT_COMPARISONS,
  achievementApiNameProblem,
  newAchievement,
  updateAchievement,
  type AchievementComparison,
  type AchievementDocument,
  type AchievementValue
} from '@shared/bundle/achievementDoc'
import { npcVar, type NpcDocument } from '@shared/bundle/npcDoc'
import type { StatKind, StatsDocument } from '@shared/statsDoc'
import {
  Button, EmptyState, Field, Hint, Input, ListRow, MasterDetail, MasterList,
  Select, Textarea
} from '../design/components'

interface AchievementPanelProps {
  doc: AchievementDocument
  stats: StatsDocument
  npcs: NpcDocument
  saving: boolean
  error: string | null
  onChange: (next: AchievementDocument) => void
}

interface VariableOption {
  name: string
  label: string
  kind: StatKind
  initial: AchievementValue
}

export function AchievementPanel({
  doc, stats, npcs, saving, error, onChange
}: AchievementPanelProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(doc.achievements[0]?.id ?? null)
  const [draftApiName, setDraftApiName] = useState('')
  const selected = doc.achievements.find((one) => one.id === selectedId) ?? null
  const variables = useMemo(() => variableOptions(stats, npcs), [stats, npcs])
  const selectedVariable = variables.find((one) => one.name === selected?.variable) ?? null

  useEffect(() => {
    if (selectedId !== null && doc.achievements.some((one) => one.id === selectedId)) return
    setSelectedId(doc.achievements[0]?.id ?? null)
  }, [doc.achievements, selectedId])

  // The API Name is what Steamworks matches on, so it is asked for at creation
  // rather than left blank to be filled in later: an achievement without one is
  // a row that cannot do anything yet, and the panel had no way to say so.
  const newProblem =
    draftApiName.trim().length > 0 ? achievementApiNameProblem(doc, draftApiName) : null

  const add = (): void => {
    if (draftApiName.trim().length === 0 || newProblem) return

    const achievement = newAchievement()
    achievement.apiName = draftApiName.trim()
    const first = variables[0]
    if (first) {
      achievement.variable = first.name
      achievement.value = first.initial
    }
    onChange({ ...doc, achievements: [...doc.achievements, achievement] })
    setSelectedId(achievement.id)
    setDraftApiName('')
  }

  const patch = (changes: Parameters<typeof updateAchievement>[2]): void => {
    if (selected) onChange(updateAchievement(doc, selected.id, changes))
  }
  const apiProblem = selected
    ? achievementApiNameProblem(doc, selected.apiName, selected.id)
    : null

  return (
    <>
      {saving && <p className="saving-note saving-note--loose">saving…</p>}
      {error && <p className="settings-error">{error}</p>}
      <MasterDetail
        className="achievement-layout"
        master={
          <>
            {/* Adding leads the column, where the other catalogues put it. In
                the pane header it acted on the list below it from outside it,
                and sat furthest from the list it was adding to. */}
            <div className="panel-new">
              <Input mono
                value={draftApiName}
                aria-label="New achievement API Name"
                placeholder="Name"
                onChange={(event) => setDraftApiName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') add()
                }}
              />
              <Button variant="primary" icon="plus"
                onClick={add}
                disabled={draftApiName.trim().length === 0 || newProblem !== null}
              >
                Add
              </Button>
            </div>

            {newProblem && (
              <Hint tight tone="error" className="panel-new-preview">{newProblem}</Hint>
            )}

            {doc.achievements.length === 0 ? (
              <Hint>
                No achievements yet. Name one as Steamworks does, then choose the Ink variable
                and value that earns it.
              </Hint>
            ) : (
              <MasterList>
                {doc.achievements.map((achievement) => (
                  <ListRow key={achievement.id}
                    name={achievement.name || achievement.apiName || 'Untitled achievement'}
                    meta={achievement.apiName || 'API Name not set'}
                    selected={achievement.id === selectedId}
                    onClick={() => setSelectedId(achievement.id)} />
                ))}
              </MasterList>
            )}
          </>
        }
        detail={selected === null ? (
          <EmptyState centered title="Nothing selected" body="Choose an achievement to edit it." />
        ) : (
          <div className="detail-list achievement-detail">
            <Field label="Steam API Name"
              note="Must exactly match the API Name in Steamworks partner settings.">
              <Input mono value={selected.apiName}
                placeholder="STORY_FIRST_CHAPTER"
                onChange={(event) => patch({ apiName: event.target.value })} />
              {apiProblem && <Hint tight tone="error">{apiProblem}</Hint>}
            </Field>
            <Field label="Name" note="For the author; Steam controls the player-facing display text.">
              <Input value={selected.name}
                onChange={(event) => patch({ name: event.target.value })} />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={selected.description}
                onChange={(event) => patch({ description: event.target.value })} />
            </Field>
            <Field label="Unlock when">
              {variables.length === 0 ? (
                <Hint>Add a stat, hidden variable, or cast attribute first.</Hint>
              ) : (
                <div className="achievement-condition">
                  <Select aria-label="Achievement variable" value={selected.variable}
                    onChange={(event) => {
                      const variable = variables.find((one) => one.name === event.target.value)
                      if (variable) patch({
                        variable: variable.name, comparison: '==', value: variable.initial
                      })
                    }}>
                    {!selectedVariable && <option value="">Choose a variable…</option>}
                    {variables.map((variable) => (
                      <option key={variable.name} value={variable.name}>{variable.label}</option>
                    ))}
                  </Select>
                  <Select aria-label="Achievement comparison" value={selected.comparison}
                    onChange={(event) => patch({
                      comparison: event.target.value as AchievementComparison
                    })}>
                    {comparisonsFor(selectedVariable?.kind).map((comparison) => (
                      <option key={comparison} value={comparison}>{comparison}</option>
                    ))}
                  </Select>
                  <ExpectedValue kind={selectedVariable?.kind ?? kindOf(selected.value)}
                    value={selected.value} onChange={(value) => patch({ value })} />
                </div>
              )}
              {selected.variable && !selectedVariable && (
                <Hint tight tone="error">
                  {selected.variable} is no longer declared by Variables or Cast.
                </Hint>
              )}
            </Field>
            <div className="detail-row detail-row--danger">
              <Button variant="danger" icon="trash-2" onClick={() => {
                onChange({ ...doc, achievements: doc.achievements.filter((one) => one.id !== selected.id) })
                setSelectedId(null)
              }}>Remove this achievement</Button>
            </div>
          </div>
        )}
      />
    </>
  )
}

function ExpectedValue({ kind, value, onChange }: {
  kind: StatKind
  value: AchievementValue
  onChange: (value: AchievementValue) => void
}): React.JSX.Element {
  if (kind === 'boolean') {
    return <Select aria-label="Achievement value" value={value === true ? 'true' : 'false'}
      onChange={(event) => onChange(event.target.value === 'true')}>
      <option value="true">true</option><option value="false">false</option>
    </Select>
  }
  return <Input aria-label="Achievement value" type={kind === 'number' ? 'number' : 'text'}
    value={typeof value === (kind === 'number' ? 'number' : 'string') ? String(value) : ''}
    onChange={(event) => onChange(kind === 'number' ? Number(event.target.value) : event.target.value)} />
}

const kindOf = (value: AchievementValue): StatKind =>
  typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text'

function comparisonsFor(kind: StatKind | undefined): readonly AchievementComparison[] {
  return kind === 'number' ? ACHIEVEMENT_COMPARISONS : ['==', '!=']
}

function variableOptions(stats: StatsDocument, npcs: NpcDocument): VariableOption[] {
  return [
    ...stats.stats.map((one) => ({
      name: one.name, label: `Variables — ${one.display || one.name}`,
      kind: one.kind, initial: one.initial
    })),
    ...stats.variables.map((one) => ({
      name: one.name, label: `Variables — ${one.name}`, kind: one.kind, initial: one.initial
    })),
    // The cast's kinds are the same three words a player stat uses, so they
    // need no translating on the way in.
    ...npcs.npcs.flatMap((npc) =>
      npc.variables.map((one) => ({
        name: npcVar(npc.inkId, one.key),
        label: `${npc.name} — ${one.label}`,
        kind: one.kind,
        initial: one.initial
      }))
    )
  ].sort((a, b) => a.label.localeCompare(b.label))
}
