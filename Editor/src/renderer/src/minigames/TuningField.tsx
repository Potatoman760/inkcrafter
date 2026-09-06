import type { TunableNumber } from '@shared/bundle/minigameDoc'
import { Button, Field, Input, Select } from '../design/components'

/**
 * A number a minigame reads, as a base plus what each point of a stat adds.
 *
 * Every tuning in every kind is one of these, so the editor for it is one
 * thing too.
 */
export function TuningField({ label, unit, value, stats, onChange }: {
  label: string
  unit: string
  value: TunableNumber
  stats: string[]
  onChange: (next: TunableNumber) => void
}): React.JSX.Element {
  return (
    <Field as="div" label={label} note={`Resolved as base + stat × per point (${unit}).`}>
      <div className="minigame-tuning-base">
        <Input
          type="number"
          aria-label={`${label} base`}
          value={value.base}
          onChange={(event) => onChange({ ...value, base: Number(event.target.value) || 0 })}
        />
        <span>{unit}</span>
      </div>
      {value.modifiers.map((modifier, index) => (
        <div className="minigame-modifier" key={`${index}:${modifier.stat}`}>
          <Select
            aria-label={`${label} modifier stat`}
            value={modifier.stat}
            onChange={(event) => onChange({
              ...value,
              modifiers: value.modifiers.map((one, at) => at === index ? { ...one, stat: event.target.value } : one)
            })}
          >
            <option value="">Choose stat…</option>
            {stats.map((stat) => <option key={stat} value={stat}>{stat}</option>)}
          </Select>
          <span>×</span>
          <Input
            type="number"
            aria-label={`${label} per point`}
            value={modifier.perPoint}
            onChange={(event) => onChange({
              ...value,
              modifiers: value.modifiers.map((one, at) => at === index ? { ...one, perPoint: Number(event.target.value) || 0 } : one)
            })}
          />
          <Button
            size="sm"
            variant="quiet"
            onClick={() => onChange({ ...value, modifiers: value.modifiers.filter((_one, at) => at !== index) })}
          >Remove</Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="quiet"
        disabled={stats.length === 0}
        onClick={() => onChange({ ...value, modifiers: [...value.modifiers, { stat: stats[0] ?? '', perPoint: 1 }] })}
      >Add stat modifier</Button>
    </Field>
  )
}
