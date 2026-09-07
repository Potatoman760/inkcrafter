import type { CombatMinigame } from '@shared/bundle/minigameDoc'
import { newCombatMinigame } from '@shared/bundle/minigameDoc'
import type { MinigameEditor, MinigameFieldsProps } from '../module'
import { Field, Select, Hint } from '../../design/components'
import { addAsset, newAsset, removeAsset } from '@shared/mediaDoc'
import { LooksField } from '../../media/LooksField'
import { TuningField } from '../TuningField'

const TUNINGS: Array<{ key: keyof Pick<CombatMinigame,
  'opponentHealth' | 'incomingDamage' | 'counterDamage' | 'prepWindowMs' |
  'counterWindowMs' | 'counterChancePercent' | 'idleMs' | 'strikeMs'>; label: string; unit: string }> = [
  { key: 'opponentHealth', label: 'Opponent health', unit: 'points' },
  { key: 'incomingDamage', label: 'Incoming damage', unit: 'points' },
  { key: 'counterDamage', label: 'Counter damage', unit: 'points' },
  { key: 'prepWindowMs', label: 'Parry window', unit: 'ms' },
  { key: 'counterWindowMs', label: 'Counter window', unit: 'ms' },
  { key: 'counterChancePercent', label: 'Counter chance', unit: '%' },
  { key: 'idleMs', label: 'Time between attacks', unit: 'ms' },
  { key: 'strikeMs', label: 'Strike display', unit: 'ms' }
]

function Fields({ selected, patch, media, files, byPath, project, onMediaChange, onMediaRescan, numeric }: MinigameFieldsProps<CombatMinigame>): React.JSX.Element {
  // Legacy opponents were characters; the stable id still owns their artwork.
  const opponent = media.assets.find((asset) => asset.id === selected.opponentAssetId) ?? null
  return (
    <>
      <Field label="Player health" note="A missed parry subtracts incoming damage from this numeric variable.">
        <Select value={selected.playerHealthVariable} onChange={(event) => patch({ playerHealthVariable: event.target.value })}>
          <option value="">Choose a numeric variable…</option>
          {numeric.map((variable) => <option key={variable.id} value={variable.name}>{variable.name}</option>)}
        </Select>
      </Field>
      <section className="minigame-section">
        <h3>Opponent art</h3>
        {opponent ? (
          <LooksField
            doc={media}
            asset={opponent}
            files={files}
            byPath={byPath}
            project={project}
            onChange={onMediaChange}
            onImported={onMediaRescan}
            note="Add idle, left/right prep, left/right strike, and vulnerable. All six use the same canvas position."
          />
        ) : <Hint tone="error">The combatant media entry is missing.</Hint>}
      </section>

      <section className="minigame-section">
        <h3>Combat tuning</h3>
        <div className="minigame-tunings">
          {TUNINGS.map((field) => (
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
  kind: 'combat', label: 'Combat', order: 1,
  countAll: true,
  create: (count) => newCombatMinigame(`New combat ${count}`),
  prepare: (game, media) => {
    if (game.kind !== 'combat') return media
    const asset = newAsset(game.name, 'combatant')
    game.opponentAssetId = asset.id
    return addAsset(media, asset)
  },
  remove: (game, doc, media) => {
    if (game.kind !== 'combat') return media
    const shared = doc.minigames.some((other) => other.kind === 'combat' &&
      other.id !== game.id && other.opponentAssetId === game.opponentAssetId)
    return shared ? media : removeAsset(media, game.opponentAssetId)
  },
  Fields: (props) => props.selected.kind === 'combat' ? <Fields {...props} selected={props.selected} /> : null,
} satisfies MinigameEditor
