import type { PowerStrikeMinigame } from '@shared/bundle/minigameDoc'
import { newPowerStrikeMinigame } from '@shared/bundle/minigameDoc'
import type { MinigameEditor, MinigameFieldsProps } from '../module'
import { Button, Hint } from '../../design/components'
import { LooksField } from '../../media/LooksField'
import { ArtworkField, ArtworkListField } from '../ArtworkField'
import { TuningField } from '../TuningField'
import { addAsset, newAsset } from '@shared/mediaDoc'

const POWERSTRIKE_TUNINGS: Array<{ key: keyof Pick<PowerStrikeMinigame,
  'targetDurability' | 'strikeLimit' | 'chargeDurationMs' | 'idealPowerPercent' |
  'perfectWindowPercent' | 'goodWindowPercent' | 'perfectDamage' | 'goodDamage' |
  'weakDamage' | 'wrongSideDamagePercent' | 'recoveryMs'>; label: string; unit: string }> = [
  { key: 'targetDurability', label: 'Target durability', unit: 'points' },
  { key: 'strikeLimit', label: 'Strike limit', unit: 'strikes' },
  { key: 'chargeDurationMs', label: 'Charge duration', unit: 'ms' },
  { key: 'idealPowerPercent', label: 'Ideal power', unit: '%' },
  { key: 'perfectWindowPercent', label: 'Perfect window', unit: '%' },
  { key: 'goodWindowPercent', label: 'Good window', unit: '%' },
  { key: 'perfectDamage', label: 'Perfect strike', unit: 'damage' },
  { key: 'goodDamage', label: 'Good strike', unit: 'damage' },
  { key: 'weakDamage', label: 'Weak strike', unit: 'damage' },
  { key: 'wrongSideDamagePercent', label: 'Wrong-side damage', unit: '%' },
  { key: 'recoveryMs', label: 'Recovery', unit: 'ms' }
]

function Fields({ selected, patch, media, files, byPath, project, onMediaChange, onMediaRescan, numeric, artwork, minigameArt }: MinigameFieldsProps<PowerStrikeMinigame>): React.JSX.Element {
  return (
    <>
      <section className="minigame-section">
        <h3>Power-strike graphics</h3>
        <Hint>Target looks are ordered from intact to broken. Leave them empty for the built-in log and splitting maul.</Hint>
        <div className="quickhands-art-grid">
          <ArtworkListField
            label="Target stage"
            value={selected.targetArt}
            options={artwork}
            onChange={(targetArt) => patch({ targetArt })}
          />
          <ArtworkField
            label="Tool"
            value={selected.toolArt}
            options={artwork}
            onChange={(toolArt) => patch({ toolArt })}
          />
        </div>
        {minigameArt ? (
          <LooksField
            doc={media}
            asset={minigameArt}
            files={files}
            byPath={byPath}
            project={project}
            onChange={onMediaChange}
            onImported={onMediaRescan}
            note="Pictures brought in here become choices for the target stages and tool."
          />
        ) : (
          <Button
            icon="folder-plus"
            onClick={() =>
              onMediaChange(addAsset(media, newAsset(selected.name, 'animation')))
            }
          >
            Add artwork for this power strike
          </Button>
        )}
      </section>

      <section className="minigame-section">
        <h3>Power-strike tuning</h3>
        <div className="minigame-tunings">
          {POWERSTRIKE_TUNINGS.map((field) => (
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
  kind: 'powerstrike', label: 'Power Strike', order: 3,
  create: (count) => newPowerStrikeMinigame(`New power strike ${count}`),
  Fields: (props) => props.selected.kind === 'powerstrike' ? <Fields {...props} selected={props.selected} /> : null,
} satisfies MinigameEditor
