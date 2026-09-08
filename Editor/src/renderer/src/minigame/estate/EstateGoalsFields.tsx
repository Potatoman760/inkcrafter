import type { EstateGoal, EstateGoalCondition, EstateMinigame } from '@shared/bundle/estate'
import { newId } from '@shared/ids'
import { Button, Checkbox, Field, Input, Select, Textarea } from '../../design/components'

export function EstateGoalsFields({ game, flags, onChange }: {
  game: EstateMinigame
  flags: string[]
  onChange: (changes: Partial<EstateMinigame>) => void
}): React.JSX.Element {
  const goals = game.goals ?? []
  const update = (index: number, patch: Partial<EstateGoal>): void =>
    onChange({ goals: goals.map((goal, at) => at === index ? { ...goal, ...patch } : goal) })
  const condition = (kind: EstateGoalCondition['kind']): EstateGoalCondition => kind === 'room'
    ? { kind, room: game.rooms[0]?.key ?? '' }
    : kind === 'variable' ? { kind, variable: flags[0] ?? '' }
      : kind === 'residents' ? { kind, count: 2, exclude: [] } : { kind }

  return <>
    <Field as="div" label="Reception readiness" about="The player receives the court only after this day and every selected required goal. Once written, readiness remains true.">
      <Checkbox label="Enable a player-selected finale" checked={!!game.finale}
        onChange={(event) => onChange({ finale: event.target.checked ? { minimumDay: 9, readyVariable: '', requiredGoalIds: [] } : null })} />
    </Field>
    {game.finale && <div className="estate-resident__fields">
      <Field label="First finale day"><Input type="number" min={1} value={game.finale.minimumDay}
        onChange={(event) => onChange({ finale: { ...game.finale!, minimumDay: Math.max(1, Math.round(Number(event.target.value) || 1)) } })} /></Field>
      <Field label="Ready flag"><Select value={game.finale.readyVariable}
        onChange={(event) => onChange({ finale: { ...game.finale!, readyVariable: event.target.value } })}>
        <option value="">Choose a boolean…</option>{flags.map(flag => <option key={flag}>{flag}</option>)}
      </Select></Field>
    </div>}

    {goals.map((goal, index) => <article className="estate-resident" key={goal.id}>
      <div className="estate-resident__fields">
        <Field label="Stable id"><Input mono value={goal.id} onChange={(event) => update(index, { id: event.target.value.trim() })} /></Field>
        <Field label="Title"><Input value={goal.title} onChange={(event) => update(index, { title: event.target.value })} /></Field>
        <Field label="Condition"><Select value={goal.condition.kind}
          onChange={(event) => update(index, { condition: condition(event.target.value as EstateGoalCondition['kind']) })}>
          <option value="room">Room restored</option><option value="variable">Story flag</option>
          <option value="residents">Resident count</option><option value="all-rooms">All available rooms</option>
        </Select></Field>
        {goal.condition.kind === 'room' && <Field label="Room"><Select value={goal.condition.room}
          onChange={(event) => update(index, { condition: { kind: 'room', room: event.target.value } })}>
          {game.rooms.map(room => <option key={room.key} value={room.key}>{room.name}</option>)}
        </Select></Field>}
        {goal.condition.kind === 'variable' && <Field label="Story flag"><Select value={goal.condition.variable}
          onChange={(event) => update(index, { condition: { kind: 'variable', variable: event.target.value } })}>
          <option value="">Choose a boolean…</option>{flags.map(flag => <option key={flag}>{flag}</option>)}
        </Select></Field>}
        {goal.condition.kind === 'residents' && <>
          <Field label="Count"><Input type="number" min={1} value={goal.condition.count}
            onChange={(event) => update(index, { condition: { kind: 'residents', count: Math.max(1, Math.round(Number(event.target.value) || 1)), exclude: goal.condition.kind === 'residents' ? goal.condition.exclude : [] } })} /></Field>
          <Field label="Exclude resident keys" about="Comma-separated; useful for staff who must not count twice."><Input mono value={(goal.condition.exclude ?? []).join(', ')}
            onChange={(event) => update(index, { condition: { kind: 'residents', count: goal.condition.kind === 'residents' ? goal.condition.count : 1, exclude: event.target.value.split(',').map(value => value.trim()).filter(Boolean) } })} /></Field>
        </>}
      </div>
      <Field label="Explanation"><Textarea rows={2} value={goal.text} onChange={(event) => update(index, { text: event.target.value })} /></Field>
      <div className="estate-list__actions">
        <Checkbox label="Required for reception" checked={goal.required} onChange={(event) => {
          update(index, { required: event.target.checked })
          if (game.finale) onChange({ finale: { ...game.finale, requiredGoalIds: event.target.checked
            ? [...new Set([...game.finale.requiredGoalIds, goal.id])] : game.finale.requiredGoalIds.filter(id => id !== goal.id) } })
        }} />
        <Button variant="danger" onClick={() => onChange({ goals: goals.filter((_, at) => at !== index),
          ...(game.finale ? { finale: { ...game.finale, requiredGoalIds: game.finale.requiredGoalIds.filter(id => id !== goal.id) } } : {}) })}>Remove</Button>
      </div>
    </article>)}
    <Button onClick={() => onChange({ goals: [...goals, { id: newId('mng'), title: 'New goal', text: 'Explain what this changes in the household.', required: false, condition: { kind: 'all-rooms' } }] })}>Add goal</Button>
  </>
}
