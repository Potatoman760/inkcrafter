import { minigameEditors } from './registry'
import { useEffect, useMemo, useState } from 'react'
import {
  minigameName,
  type MinigameDefinition,
  type MinigameDocument,
} from '@shared/bundle/minigameDoc'
import {
  isVideoFile,
  mediaName,
  type MediaDocument
} from '@shared/mediaDoc'
import { npcVar, type NpcDocument } from '@shared/bundle/npcDoc'
import type { Project } from '@shared/project'
import type { MediaFile } from '@shared/types'
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  ListRow,
  MasterDetail,
  Menu,
  MenuItem,
  PaneHeader,
  Select,
  Textarea
} from '../design/components'
import { ArtField, type ArtHome, type ArtOption } from './ArtField'

export interface MinigamePanelProps {
  doc: MinigameDocument
  stats: import('@shared/statsDoc').StatsDocument
  /** For the true/false variables an NPC declares, which a villa gate can name. */
  npcs: NpcDocument
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

/** Every still look of one kind, with its picture found, ready to be chosen from. */
function stills(
  media: MediaDocument,
  byPath: Map<string, MediaFile>,
  kind: 'background' | 'animation' | 'character'
): ArtOption[] {
  return media.assets
    .filter((asset) => asset.kind === kind)
    .flatMap((asset) => asset.variants
      .filter((variant) => !isVideoFile(variant.file))
      .map((variant) => ({
        ref: { assetId: asset.id, variantId: variant.id },
        label: `${asset.display || asset.name} — ${variant.name}`,
        url: byPath.get(variant.file)?.url ?? null
      })))
}

export function MinigamePanel(props: MinigamePanelProps): React.JSX.Element {
  const { doc, stats, npcs, media, files, project, saving, error, onChange, onMediaChange,
    onMediaRescan, onTest } = props
  const [selectedId, setSelectedId] = useState<string | null>(doc.minigames[0]?.id ?? null)
  const [testing, setTesting] = useState(false)
  /** Whether the kind menu under Add is showing. */
  const [adding, setAdding] = useState(false)
  const selected = doc.minigames.find((game) => game.id === selectedId) ?? null
  const editor = selected ? minigameEditors.find((one) => one.kind === selected.kind) : undefined
  const numeric = [...stats.stats, ...stats.variables].filter((one) => one.kind === 'number')
  const textual = [...stats.stats, ...stats.variables].filter((one) => one.kind === 'text')
  /** Every declared true/false, an NPC's included: what a gate or an invitation names. */
  const flags = [
    ...[...stats.stats, ...stats.variables].filter((one) => one.kind === 'boolean').map((one) => one.name),
    ...npcs.npcs.flatMap((npc) =>
      npc.variables.filter((one) => one.kind === 'boolean').map((one) => npcVar(npc.inkId, one.key)))
  ]
  const portraits = media.assets.filter((asset) => asset.kind === 'character').map((asset) => asset.name)
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])
  const backgrounds = useMemo(() => stills(media, byPath, 'background'), [media, byPath])
  const artwork = useMemo(() => stills(media, byPath, 'animation'), [media, byPath])
  const characterArt = useMemo(() => stills(media, byPath, 'character'), [media, byPath])
  /**
   * The animation asset this cabinet keeps its own pictures in, if it has one.
   *
   * Named after the minigame so the folder on disk matches what the author sees
   * in the panel. Looks are still chosen from every animation above — this only
   * gives a picture somewhere to land without leaving for the Media panel.
   */
  const minigameArt = selected
    ? media.assets.find(
        (one) => one.kind === 'animation' && one.name === mediaName(selected.name)
      ) ?? null
    : null
  /**
   * Where a picture uploaded from one of a minigame's slots is filed: a
   * background asset named after the minigame, made on first use. Backgrounds,
   * because every slot besides a sprite is one — the scene, and for the villa
   * its plans, interiors and notice board. Sprites keep the animation asset
   * `minigameArt` above.
   */
  const homeOf = (game: MinigameDefinition): ArtHome => ({
    project,
    media,
    kind: 'background',
    asset: game.name,
    display: game.display,
    onMediaChange,
    onImported: onMediaRescan
  })

  useEffect(() => {
    if (selectedId !== null && doc.minigames.some((game) => game.id === selectedId)) return
    setSelectedId(doc.minigames[0]?.id ?? null)
  }, [doc.minigames, selectedId])

  const patch = (
    changes: Partial<MinigameDefinition>
  ): void => {
    if (!selected) return
    onChange({
      ...doc,
      minigames: doc.minigames.map((game) => (
        game.id === selected.id ? { ...game, ...changes } as MinigameDefinition : game
      ))
    })
  }

  const create = (module: (typeof minigameEditors)[number]): void => {
    const count = module.countAll
      ? doc.minigames.length + 1
      : doc.minigames.filter((game) => game.kind === module.kind).length + 1
    const game = module.create(count)
    const nextMedia = module.prepare?.(game, media)
    if (nextMedia && nextMedia !== media) onMediaChange(nextMedia)
    onChange({ ...doc, minigames: [...doc.minigames, game] })
    setSelectedId(game.id)
    setAdding(false)
  }

  const remove = (): void => {
    if (!selected) return
    const nextMedia = editor?.remove?.(selected, doc, media)
    onChange({ ...doc, minigames: doc.minigames.filter((game) => game.id !== selected.id) })
    if (nextMedia && nextMedia !== media) onMediaChange(nextMedia)
    setSelectedId(null)
  }

  return (
    <MasterDetail
      masterClassName="minigame-master"
      detailClassName="minigame-detail"
      master={
        <>
          <PaneHeader
            title="Minigames"
            actions={
              /* One button rather than one per kind: the header is 270px wide
                 and two labels pushed the pane's own title into an ellipsis.
                 Hover opens it, and so does a click, because keyboard and touch
                 cannot hover. Deliberately not a toggle: a pointer click is
                 preceded by its own mouseenter, so toggling would open the menu
                 and immediately shut it again. Leaving, choosing, or Escape
                 closes it. */
              <div
                className="minigame-add"
                onMouseEnter={() => setAdding(true)}
                onMouseLeave={() => setAdding(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setAdding(false)
                }}
              >
                <Button
                  size="sm"
                  icon="plus"
                  aria-haspopup="menu"
                  aria-expanded={adding}
                  onClick={() => setAdding(true)}
                >
                  Add
                </Button>
                {adding && (
                  /* The offset from the button is this wrapper's padding rather
                     than a gap, so it is hoverable. A real gap belongs to
                     neither element, and crossing it fires mouseleave on the
                     group — the menu shut before the pointer reached it. */
                  <div className="minigame-add__pop">
                    <Menu aria-label="Add a minigame">
                      {minigameEditors.map((module) => (
                        <MenuItem key={module.kind} onClick={() => create(module)}>{module.label}</MenuItem>
                      ))}
                    </Menu>
                  </div>
                )}
              </div>
            }
          />
          {saving && <span className="saving-note">saving…</span>}
          {error && <p className="settings-error">{error}</p>}
          {doc.minigames.length === 0 ? (
            <EmptyState title="No minigames" body="Add an encounter, then call it from ink with # minigame:." />
          ) : (
            <div className="minigame-list">
              {doc.minigames.map((game) => (
                <ListRow
                  key={game.id}
                  selected={game.id === selectedId}
                  name={game.display || game.name}
                  // The kind alone. The ink name was here too, but it is on the
                  // detail pane under the field that sets it, which is where an
                  // author goes when they want it.
                  meta={minigameEditors.find((one) => one.kind === game.kind)?.label ?? game.kind}
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
              <Field label="Result" note={editor?.resultNote ?? 'Set to victory or defeat before the story continues.'}>
                <Select value={selected.resultVariable} onChange={(event) => patch({ resultVariable: event.target.value })}>
                  <option value="">Choose a text variable…</option>
                  {textual.map((variable) => <option key={variable.id} value={variable.name}>{variable.name}</option>)}
                </Select>
              </Field>
            </div>

            {!editor?.customTutorial && <Field as="div" label="Tutorial prompts" note="Enable transient instructions and action feedback during the encounter.">
              <Checkbox
                label={`Show helper text during ${(editor?.label ?? selected.kind).toLowerCase()}`}
                checked={selected.showStateHints}
                onChange={(event) => patch({ showStateHints: event.target.checked })}
              />
            </Field>}

            {/* The villa's background is its floor plan, chosen beside the plan
                rather than here. */}
            {!editor?.customBackground && (
              <section className="minigame-section">
                <h3>Scene background</h3>
                <ArtField
                  label="Background image"
                  value={selected.background}
                  options={backgrounds}
                  shape="wide"
                  emptyLabel="No background"
                  home={homeOf(selected)}
                  look="background"
                  onChange={(background) => patch({ background })}
                />
              </section>
            )}

            {editor && <editor.Fields {...props} selected={selected} patch={patch}
              numeric={numeric} textual={textual} flags={flags} portraits={portraits}
              byPath={byPath} backgrounds={backgrounds} artwork={artwork}
              characterArt={characterArt} minigameArt={minigameArt} homeOf={homeOf} />}

            <div className="detail-row detail-row--danger">
              <Button variant="danger" icon="trash-2" onClick={remove}>Remove this minigame</Button>
            </div>
          </div>
        </>
      )}
    />
  )
}

