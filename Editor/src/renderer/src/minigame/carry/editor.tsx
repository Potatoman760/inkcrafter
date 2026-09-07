import type { CarryMinigame } from '@shared/bundle/minigameDoc'
import { newCarryMinigame } from '@shared/bundle/minigameDoc'
import type { MinigameEditor, MinigameFieldsProps } from '../module'
import { Hint } from '../../design/components'
import { ArtworkField } from '../ArtworkField'
import { TuningField } from '../TuningField'

const CARRY_TUNINGS: Array<{ key: keyof Pick<CarryMinigame,
  'distanceMs' | 'staminaMax' | 'staminaDrainPerSecond' | 'wobbleDriftPerSecond' |
  'wobbleLimit' | 'correctionStrength' | 'tiltDrainMultiplier'>; label: string; unit: string }> = [
  { key: 'distanceMs', label: 'Distance', unit: 'ms' },
  { key: 'staminaMax', label: 'Stamina', unit: 'points' },
  { key: 'staminaDrainPerSecond', label: 'Stamina drain', unit: 'per second' },
  { key: 'wobbleDriftPerSecond', label: 'Wobble drift', unit: 'tilt per second' },
  { key: 'wobbleLimit', label: 'Drop at tilt', unit: 'tilt' },
  { key: 'correctionStrength', label: 'Correction', unit: 'tilt' },
  { key: 'tiltDrainMultiplier', label: 'Tilt drain', unit: '× at full lean' }
]

function Fields({ selected, patch, numeric, artwork }: MinigameFieldsProps<CarryMinigame>): React.JSX.Element {
  return (
    <>
      <section className="minigame-section">
        <h3>The load</h3>
        <Hint>A still Animation look for what Kael is carrying, or leave it empty for the built-in shape.</Hint>
        <div className="quickhands-art-grid">
          <ArtworkField
            label="Load"
            value={selected.loadArt}
            options={artwork}
            onChange={(loadArt) => patch({ loadArt })}
          />
        </div>
      </section>

      <section className="minigame-section">
        <h3>Carry tuning</h3>
        <div className="minigame-tunings">
          {CARRY_TUNINGS.map((field) => (
            <TuningField
              key={field.key}
              label={field.label}
              unit={field.unit}
              value={selected[field.key]}
              stats={numeric.map((one) => one.name)}
              onChange={(value) => patch({ [field.key]: value })}
            />
          ))}
        </div>
      </section>
    </>
  )
}

export default {
  kind: 'carry', label: 'The Carry', order: 2,
  create: (count) => newCarryMinigame(`New carry ${count}`),
  Fields: (props) => props.selected.kind === 'carry' ? <Fields {...props} selected={props.selected} /> : null,
} satisfies MinigameEditor
