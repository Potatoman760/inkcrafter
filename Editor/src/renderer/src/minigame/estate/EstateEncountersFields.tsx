import type { EstateEncounter, EstateMinigame } from '@shared/bundle/estate'
import { Button, Checkbox, Field, Input, Select, Textarea } from '../../design/components'

export function EstateEncountersFields({ game, flags, onChange }: {
  game: EstateMinigame
  flags: string[]
  onChange: (changes: Partial<EstateMinigame>) => void
}): React.JSX.Element {
  const encounters = game.encounters ?? []
  const update = (index: number, patch: Partial<EstateEncounter>): void =>
    onChange({ encounters: encounters.map((one, at) => at === index ? { ...one, ...patch } : one) })
  return <>
    {encounters.map((one, index) => <article className="estate-resident" key={index}>
      <div className="estate-resident__fields">
        <Field label="Title"><Input value={one.title} onChange={event => update(index, { title: event.target.value })} /></Field>
        <Field label="Result"><Input mono value={one.result} onChange={event => update(index, { result: event.target.value })} /></Field>
        <Field label="Room"><Select value={one.room} onChange={event => update(index, { room: event.target.value })}>
          <option value="">Choose a room…</option>{game.rooms.map(room => <option key={room.key} value={room.key}>{room.name}</option>)}
        </Select></Field>
        <Field label="Story gate"><Select value={one.gate ?? ''} onChange={event => update(index, { gate: event.target.value || null })}>
          <option value="">No extra gate</option>{flags.map(flag => <option key={flag}>{flag}</option>)}
        </Select></Field>
      </div>
      <Field label="Room cue"><Textarea rows={2} value={one.cue} onChange={event => update(index, { cue: event.target.value })} /></Field>
      <Field as="div" label="Residents" about="Everyone selected must currently live in a restored, available home here. Relationship eligibility alone is insufficient.">
        {game.residents.map(person => <Checkbox key={person.key} label={person.name} checked={one.residents.includes(person.key)}
          onChange={event => update(index, { residents: event.target.checked ? [...one.residents, person.key] : one.residents.filter(key => key !== person.key) })} />)}
      </Field>
      <Button variant="danger" onClick={() => onChange({ encounters: encounters.filter((_, at) => at !== index) })}>Remove</Button>
    </article>)}
    <Button onClick={() => onChange({ encounters: [...encounters, { room: game.rooms[0]?.key ?? '', result: '', title: 'Household moment', cue: '', residents: [] }] })}>Add encounter</Button>
  </>
}
