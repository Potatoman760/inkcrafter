import type { QuickhandsMinigame } from '@shared/bundle/minigameDoc'
import { newQuickhandsMinigame } from '@shared/bundle/minigameDoc'
import type { MinigameEditor, MinigameFieldsProps } from '../module'
import { Button, Hint } from '../../design/components'
import { LooksField } from '../../media/LooksField'
import { ArtworkField, ArtworkListField } from '../ArtworkField'
import { TuningField } from '../TuningField'
import { addAsset, newAsset } from '@shared/mediaDoc'

const QUICKHANDS_TUNINGS: Array<{ key: keyof Pick<QuickhandsMinigame,
  'laneCount' | 'roundDurationMs' | 'spawnIntervalMs' | 'fallDurationMs' |
  'catchWindowMs' | 'targetChancePercent' | 'goalScore' | 'targetPoints' |
  'hazardPenalty' | 'missedTargetPenalty'>; label: string; unit: string }> = [
  { key: 'laneCount', label: 'Lanes', unit: 'lanes' },
  { key: 'roundDurationMs', label: 'Round duration', unit: 'ms' },
  { key: 'spawnIntervalMs', label: 'Spawn interval', unit: 'ms' },
  { key: 'fallDurationMs', label: 'Fall duration', unit: 'ms' },
  { key: 'catchWindowMs', label: 'Catch window', unit: 'ms' },
  { key: 'targetChancePercent', label: 'Valuable token chance', unit: '%' },
  { key: 'goalScore', label: 'Victory score', unit: 'points' },
  { key: 'targetPoints', label: 'Caught token', unit: 'points' },
  { key: 'hazardPenalty', label: 'Caught hazard penalty', unit: 'points' },
  { key: 'missedTargetPenalty', label: 'Missed token penalty', unit: 'points' }
]

function Fields({ selected, patch, media, files, byPath, project, onMediaChange, onMediaRescan, numeric, artwork, minigameArt }: MinigameFieldsProps<QuickhandsMinigame>): React.JSX.Element {
  return (
    <>
      <section className="minigame-section">
        <h3>Quick-hands graphics</h3>
        <Hint>Use still Animation looks, or leave a field empty for the built-in token shapes. Give a token or hazard more than one look and the game picks one of them for each round.</Hint>
        <div className="quickhands-art-grid">
          <ArtworkListField
            label="Valuable tokens"
            value={selected.targetArt}
            options={artwork}
            onChange={(targetArt) => patch({ targetArt })}
          />
          <ArtworkListField
            label="Hazards"
            value={selected.hazardArt}
            options={artwork}
            onChange={(hazardArt) => patch({ hazardArt })}
          />
          <ArtworkField
            label="Catcher"
            value={selected.catcherArt}
            options={artwork}
            onChange={(catcherArt) => patch({ catcherArt })}
          />
        </div>

        {/* Choosing above is only possible once there is something to
            choose. This is the Media panel's own look list, pointed at
            an animation of this cabinet's, so a picture can be brought
            in here rather than in another panel and back. */}
        {minigameArt ? (
          <LooksField
            doc={media}
            asset={minigameArt}
            files={files}
            byPath={byPath}
            project={project}
            onChange={onMediaChange}
            onImported={onMediaRescan}
            note="Pictures brought in here become choices in the lists above."
          />
        ) : (
          <Button
            icon="folder-plus"
            onClick={() =>
              onMediaChange(addAsset(media, newAsset(selected.name, 'animation')))
            }
          >
            Add artwork for this cabinet
          </Button>
        )}
      </section>

      <section className="minigame-section">
        <h3>Quick-hands tuning</h3>
        <div className="minigame-tunings">
          {QUICKHANDS_TUNINGS.map((field) => (
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
  kind: 'quickhands', label: 'Quick-hands', order: 0,
  create: (count) => newQuickhandsMinigame(`New quick-hands ${count}`),
  Fields: (props) => props.selected.kind === 'quickhands' ? <Fields {...props} selected={props.selected} /> : null,
} satisfies MinigameEditor
