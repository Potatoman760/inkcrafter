import { useEffect, useMemo, useState } from 'react'
import {
  minigameName,
  newCombatMinigame,
  type CombatMinigame,
  type MinigameDocument,
  type TunableNumber
} from '@shared/bundle/minigameDoc'
import {
  addAsset,
  isVideoFile,
  newAsset,
  removeAsset,
  type MediaDocument
} from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import type { MediaFile } from '@shared/types'
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  Hint,
  Input,
  ListRow,
  MasterDetail,
  PaneHeader,
  Select,
  Textarea
} from '../design/components'
import { LooksField } from '../media/LooksField'

interface MinigamePanelProps {
  doc: MinigameDocument
  stats: import('@shared/statsDoc').StatsDocument
  media: MediaDocument
  files: MediaFile[]
  project: Project | null
  saving: boolean
  error: string | null
  onChange: (next: MinigameDocument) => void
  onMediaChange: (next: MediaDocument) => void
  onMediaRescan: () => void
  onTest: (name: string) => Promise<void>
}

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

const refKey = (ref: { assetId: string; variantId: string }): string =>
  `${ref.assetId}:${ref.variantId}`

export function MinigamePanel(props: MinigamePanelProps): React.JSX.Element {
  const { doc, stats, media, files, project, saving, error, onChange, onMediaChange,
    onMediaRescan, onTest } = props
  const [selectedId, setSelectedId] = useState<string | null>(doc.minigames[0]?.id ?? null)
  const [testing, setTesting] = useState(false)
  const selected = doc.minigames.find((game) => game.id === selectedId) ?? null
  const numeric = [...stats.stats, ...stats.variables].filter((one) => one.kind === 'number')
  const textual = [...stats.stats, ...stats.variables].filter((one) => one.kind === 'text')
  const opponent = selected
    ? media.assets.find((asset) => asset.id === selected.opponentAssetId && asset.kind === 'combatant') ?? null
    : null
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])
  const backgrounds = useMemo(
    () => media.assets
      .filter((asset) => asset.kind === 'background')
      .flatMap((asset) => asset.variants
        .filter((variant) => !isVideoFile(variant.file))
        .map((variant) => ({
          ref: { assetId: asset.id, variantId: variant.id },
          label: `${asset.display || asset.name} — ${variant.name}`,
          file: variant.file
        }))),
    [media]
  )
  const selectedBackground = selected?.background
    ? backgrounds.find((one) => refKey(one.ref) === refKey(selected.background!)) ?? null
    : null
  const backgroundUrl = selectedBackground ? byPath.get(selectedBackground.file)?.url ?? null : null

  useEffect(() => {
    if (selectedId !== null && doc.minigames.some((game) => game.id === selectedId)) return
    setSelectedId(doc.minigames[0]?.id ?? null)
  }, [doc.minigames, selectedId])

  const patch = (changes: Partial<CombatMinigame>): void => {
    if (!selected) return
    onChange({
      ...doc,
      minigames: doc.minigames.map((game) => game.id === selected.id ? { ...game, ...changes } : game)
    })
  }

  const create = (): void => {
    const count = doc.minigames.length + 1
    const game = newCombatMinigame(`New combat ${count}`)
    const asset = newAsset(game.name || `combat_${count}`, 'combatant')
    game.opponentAssetId = asset.id
    onMediaChange(addAsset(media, asset))
    onChange({ ...doc, minigames: [...doc.minigames, game] })
    setSelectedId(game.id)
  }

  const remove = (): void => {
    if (!selected) return
    const stillUsed = doc.minigames.some(
      (game) => game.id !== selected.id && game.opponentAssetId === selected.opponentAssetId
    )
    onChange({ ...doc, minigames: doc.minigames.filter((game) => game.id !== selected.id) })
    if (!stillUsed && opponent) onMediaChange(removeAsset(media, opponent.id))
    setSelectedId(null)
  }

  return (
    <MasterDetail
      masterWidth={270}
      masterClassName="minigame-master"
      detailClassName="minigame-detail"
      master={
        <>
          <PaneHeader
            title="Minigames"
            actions={<Button size="sm" icon="plus" onClick={create}>Add combat</Button>}
          />
          {saving && <span className="saving-note">saving…</span>}
          {error && <p className="settings-error">{error}</p>}
          {doc.minigames.length === 0 ? (
            <EmptyState title="No minigames" body="Add a combat encounter, then call it from ink with # minigame:." />
          ) : (
            <div className="minigame-list">
              {doc.minigames.map((game) => (
                <ListRow
                  key={game.id}
                  selected={game.id === selectedId}
                  name={game.display || game.name}
                  meta={`# minigame: ${game.name}`}
                  onClick={() => setSelectedId(game.id)}
                />
              ))}
            </div>
          )}
        </>
      }
      detail={selected === null ? (
        <EmptyState centered title="Nothing selected" body="Choose a minigame to edit it." />
      ) : (
        <>
          <PaneHeader
            title={selected.display || selected.name}
            actions={
              <Button
                variant="primary"
                icon="play"
                disabled={testing}
                onClick={() => {
                  setTesting(true)
                  void onTest(selected.name).finally(() => setTesting(false))
                }}
              >{testing ? 'Opening…' : 'Test in player'}</Button>
            }
          />
          <div className="minigame-fields">
            <Field label="Display name">
              <Input value={selected.display} onChange={(event) => patch({ display: event.target.value })} />
            </Field>
            <Field label="Ink name" note={<>Written as <code># minigame: {selected.name}</code>.</>}>
              <Input
                value={selected.name}
                onChange={(event) => patch({ name: minigameName(event.target.value) })}
              />
            </Field>
            <Field label="Notes">
              <Textarea value={selected.description} onChange={(event) => patch({ description: event.target.value })} />
            </Field>

            <div className="minigame-bindings">
              <Field label="Player health" note="A missed parry subtracts incoming damage from this numeric variable.">
                <Select value={selected.playerHealthVariable} onChange={(event) => patch({ playerHealthVariable: event.target.value })}>
                  <option value="">Choose a numeric variable…</option>
                  {numeric.map((variable) => <option key={variable.id} value={variable.name}>{variable.name}</option>)}
                </Select>
              </Field>
              <Field label="Result" note="Set to victory or defeat before the story continues.">
                <Select value={selected.resultVariable} onChange={(event) => patch({ resultVariable: event.target.value })}>
                  <option value="">Choose a text variable…</option>
                  {textual.map((variable) => <option key={variable.id} value={variable.name}>{variable.name}</option>)}
                </Select>
              </Field>
            </div>

            <Field as="div" label="Tutorial prompts" note="Normally hidden; enable transient instructions and action feedback for a teaching encounter.">
              <Checkbox
                label="Show state helper text during combat"
                checked={selected.showStateHints}
                onChange={(event) => patch({ showStateHints: event.target.checked })}
              />
            </Field>

            <section className="minigame-section">
              <h3>Battle background</h3>
              <Field label="Background image" note="Choose one background look to fill the combat scene.">
                <Select
                  value={selected.background ? refKey(selected.background) : ''}
                  onChange={(event) => {
                    const look = backgrounds.find((one) => refKey(one.ref) === event.target.value)
                    patch({ background: look?.ref ?? null })
                  }}
                >
                  <option value="">No background</option>
                  {backgrounds.map((look) => (
                    <option key={refKey(look.ref)} value={refKey(look.ref)}>{look.label}</option>
                  ))}
                </Select>
              </Field>
              {backgroundUrl ? (
                <img className="minigame-background-preview" src={backgroundUrl} alt="" />
              ) : backgrounds.length === 0 ? (
                <Hint>Add an image under Media → Backgrounds first.</Hint>
              ) : null}
            </section>

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

            <div className="detail-row detail-row--danger">
              <Button variant="danger" icon="trash-2" onClick={remove}>Remove this minigame</Button>
            </div>
          </div>
        </>
      )}
    />
  )
}

function TuningField({ label, unit, value, stats, onChange }: {
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
