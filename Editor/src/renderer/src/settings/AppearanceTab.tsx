import type { Settings } from './useSettings'
import { Field, Hint, Select } from '../design/components'

const SCALES = [
  { value: 0.8, label: 'Compact — 80%' },
  { value: 0.9, label: 'Small — 90%' },
  { value: 1, label: 'Default — 100%' },
  { value: 1.1, label: 'Large — 110%' },
  { value: 1.25, label: 'Larger — 125%' },
  { value: 1.5, label: 'Largest — 150%' }
] as const

export function AppearanceTab({ settings }: { settings: Settings }): React.JSX.Element {
  return (
    <div className="settings-tab">
      <Field as="div" label="Interface size">
        <Select
          aria-label="Interface size"
          value={settings.settings.interfaceScale}
          onChange={(event) => void settings.setInterfaceScale(Number(event.target.value))}
        >
          {SCALES.map((scale) => (
            <option key={scale.value} value={scale.value}>
              {scale.label}
            </option>
          ))}
        </Select>
        <Hint tight>Scales text, controls, dialogs, and the editor throughout InkCrafter.</Hint>
      </Field>

      {settings.error && <Hint tone="error">{settings.error}</Hint>}
    </div>
  )
}
