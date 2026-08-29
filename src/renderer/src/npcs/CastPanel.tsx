import { useState } from 'react'
import {
  asKind,
  inkKey,
  newNpcVariable,
  NPC_VAR_KINDS,
  npcName,
  npcVar,
  type Npc,
  type NpcDocument,
  type NpcVariable,
  type NpcVarKind
} from '@shared/bundle/npcDoc'
import { newId } from '@shared/ids'
import {
  addAsset,
  assetsOfKind,
  mediaName,
  newAsset,
  removeAsset,
  type MediaAsset,
  type MediaDocument
} from '@shared/mediaDoc'
import type { MediaFile } from '@shared/types'
import type { Project } from '@shared/project'
import { LooksField } from '../media/LooksField'
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Hint,
  IconButton,
  Input,
  ListRow,
  MasterDetail,
  MasterList,
  Meter,
  PaneHeader,
  Select
} from '../design/components'
import { copy } from '@shared/copy'

interface CastPanelProps {
  doc: NpcDocument
  saving: boolean
  error: string | null
  /** The media catalogue: a character's sprites are edited here, beside them. */
  media: MediaDocument
  /** Everything under the project's `media/`, for choosing a look's file. */
  files: MediaFile[]
  /** Which project's folder a picture would be brought into. */
  project?: Project | null
  onChange: (next: NpcDocument) => void
  onMediaChange: (next: MediaDocument) => void
  /** Rereads the folder, for after a picture has been copied in. */
  onMediaRescan?: () => void
}

/**
 * The cast, and what the story tracks about them.
 *
 * The same shape as every other catalogue — a list on the left, the selected
 * entry on the right — because they are the same job and five near-misses is
 * what the shared layout exists to stop.
 *
 * What is different is that every field here becomes an ink variable, so the
 * variable name is shown beside each attribute. An author writing
 * `# npc: abeline affection +2` is spelling out something this screen decided,
 * and hiding that would make the two feel unrelated when they are the same
 * thing.
 *
 * Their sprites live here too, rather than under a Characters tab in the media
 * catalogue. A person is one thing — what they look like and what the story
 * knows about them are not two jobs done in two places, and keeping them apart
 * meant a name typed twice and a link that could quietly point at nobody.
 */
export function CastPanel({
  doc,
  saving,
  error,
  media,
  files,
  project = null,
  onChange,
  onMediaChange,
  onMediaRescan
}: CastPanelProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(doc.npcs[0]?.id ?? null)
  const [draftName, setDraftName] = useState('')
  const [filter, setFilter] = useState('')

  const selected = doc.npcs.find((npc) => npc.id === selectedId) ?? doc.npcs[0] ?? null

  const terms = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = doc.npcs.filter((npc) =>
    terms.every((term) => `${npc.name} ${npc.inkId}`.toLowerCase().includes(term))
  )

  const patch = (id: string, changes: Partial<Npc>): void =>
    onChange({ ...doc, npcs: doc.npcs.map((npc) => (npc.id === id ? { ...npc, ...changes } : npc)) })

  /** The character asset holding this person's looks, if they have one yet. */
  const spriteOf = (npc: Npc): MediaAsset | null =>
    assetsOfKind(media, 'character').find((asset) => asset.name === npc.sprite) ?? null

  /**
   * Gives someone a character asset the first time they need one.
   *
   * Named after their ink name rather than sharing it: the two are separate
   * fields, and a rename here would silently break every `# char:` line already
   * written. Matching on creation is enough to make them agree in practice.
   */
  const ensureSprite = (npc: Npc): MediaAsset => {
    const existing = spriteOf(npc)
    if (existing) return existing

    const taken = new Set(assetsOfKind(media, 'character').map((asset) => asset.name))
    const wanted = mediaName(npc.inkId) || 'someone'
    let name = wanted
    for (let suffix = 2; taken.has(name); suffix++) name = `${wanted}_${suffix}`

    const asset = { ...newAsset(npc.name || name, 'character'), name }
    onMediaChange(addAsset(media, asset))
    patch(npc.id, { sprite: name })
    return asset
  }

  const add = (): void => {
    const wanted = npcName(draftName) || 'someone'
    const taken = new Set(doc.npcs.map((npc) => npc.inkId))
    let inkId = wanted
    for (let suffix = 2; taken.has(inkId); suffix++) inkId = `${wanted}_${suffix}`

    const npc: Npc = {
      id: newId('med'),
      inkId,
      name: draftName.trim() || 'Someone',
      sprite: '',
      variables: []
    }
    onChange({ ...doc, npcs: [...doc.npcs, npc] })
    setSelectedId(npc.id)
    setDraftName('')
  }

  const remove = (npc: Npc): void => {
    const asset = spriteOf(npc)

    // Their variables vanish with them, and any ink branching on one stops
    // compiling — worth a question rather than a quiet deletion. Their looks go
    // too, now that those are part of them, so the question says so; the image
    // files themselves are left alone in `media/`.
    const message =
      `Remove ${npc.name}? The story will no longer have ` +
      `${npcVar(npc.inkId, 'anything')}-style variables for them, and any ink using ` +
      'those will stop compiling.' +
      (asset
        ? ` Their ${asset.variants.length} look(s) go too, though the image files stay in media/.`
        : '')
    if (!window.confirm(message)) return

    onChange({ ...doc, npcs: doc.npcs.filter((one) => one.id !== npc.id) })
    if (asset) onMediaChange(removeAsset(media, asset.id))
    setSelectedId(null)
  }

  const master = (
    <>
      <div className="panel-new">
        <Input
          size="sm"
          mono
          aria-label="New cast member"
          placeholder="Name"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
        />
        <Button size="sm" variant="primary" icon="plus" onClick={add}>
          Add
        </Button>
      </div>

      <Input
        className="codex-filter"
        size="sm"
        aria-label="Filter"
        placeholder="Filter…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />

      {doc.npcs.length === 0 && <Hint>No cast yet.</Hint>}
      {doc.npcs.length > 0 && shown.length === 0 && <Hint>Nothing matches that filter.</Hint>}

      <MasterList>
        {shown.map((npc) => {
          const attributes = npc.variables.length
          return (
            <ListRow
              key={npc.id}
              name={npc.name}
              meta={npc.inkId}
              selected={npc.id === selected?.id}
              onClick={() => setSelectedId(npc.id)}
              // A zero shows rather than hiding: somebody the story tracks
              // nothing about is exactly what an author would want to notice.
              trail={
                <Badge variant={attributes === 0 ? 'zero' : 'default'}>{attributes}</Badge>
              }
            />
          )
        })}
      </MasterList>
    </>
  )

  return (
    <>
      {error !== null && <p className="settings-error">{error}</p>}

      <MasterDetail
        className="cast-layout"
        master={master}
        detail={
          selected ? (
            <NpcEditor
              npc={selected}
              media={media}
              files={files}
              sprite={spriteOf(selected)}
              saving={saving}
              project={project}
              onPatch={(changes) => patch(selected.id, changes)}
              onMediaChange={onMediaChange}
              onMediaRescan={onMediaRescan}
              onAddSprite={() => ensureSprite(selected)}
              onRemove={() => remove(selected)}
            />
          ) : (
            <EmptyState
              centered
              title="Nobody selected"
              body={
                <>
                  Whoever you add here gets one ink variable per attribute,
                  declared in the generated <code>ink/state.ink</code>, so the
                  story can branch on them and a save keeps them without
                  anything else being written.
                </>
              }
            />
          )
        }
      />
    </>
  )
}

interface NpcEditorProps {
  npc: Npc
  media: MediaDocument
  files: MediaFile[]
  /** Their character asset, or null until they need one. */
  sprite: MediaAsset | null
  saving: boolean
  /** Which project's folder a picture would be brought into. */
  project: Project | null
  onPatch: (changes: Partial<Npc>) => void
  onMediaChange: (next: MediaDocument) => void
  onMediaRescan?: () => void
  onAddSprite: () => void
  onRemove: () => void
}

function NpcEditor({
  npc,
  media,
  files,
  sprite,
  saving,
  project,
  onPatch,
  onMediaChange,
  onMediaRescan,
  onAddSprite,
  onRemove
}: NpcEditorProps): React.JSX.Element {
  const byPath = new Map(files.map((file) => [file.path, file]))
  const addVariable = (): void =>
    onPatch({
      variables: [
        ...npc.variables,
        newNpcVariable('number', uniqueKey(npc, 'affection'), 'Affection')
      ]
    })

  const patchVariable = (index: number, next: NpcVariable): void =>
    onPatch({ variables: npc.variables.map((one, at) => (at === index ? next : one)) })

  return (
    <>
      <PaneHeader title={npc.name} actions={saving && <span className="saving-note">saving…</span>} />

      <Field label="Name">
        <Input value={npc.name} onChange={(event) => onPatch({ name: event.target.value })} />
      </Field>

      <Field label="Ink name" note={copy('cast.inkName', { variable: npcVar(npc.inkId, 'attribute') })}>
        <Input
          mono
          value={npc.inkId}
          onChange={(event) => onPatch({ inkId: npcName(event.target.value) })}
        />
      </Field>

      {/* Their sprites, in the same pane as their state. Not everyone in the
          cast appears on screen, so the section starts as an offer rather than
          an empty list of looks. */}
      {sprite ? (
        <LooksField
          doc={media}
          asset={sprite}
          files={files}
          byPath={byPath}
          project={project}
          note={copy('cast.sprite', { name: sprite.name })}
          onChange={onMediaChange}
          onImported={onMediaRescan}
        />
      ) : (
        <Field as="div" label="Looks" about={copy('cast.onScreenOnly')}>
          {npc.sprite.length > 0 ? (
            // Named but not there: media.json has been edited elsewhere. Said
            // out loud rather than quietly replaced, because "give them a look"
            // would mint a second asset and drop the name the ink still uses.
            <Hint tone="error">
              {npc.name} points at a character called <code>{npc.sprite}</code>,
              which is not in the catalogue. Any <code>{`# char: ${npc.sprite}`}</code>{' '}
              in the story shows nothing.
            </Hint>
          ) : (
            <Hint>
              Nothing to show for {npc.name} yet. Someone the story tracks need
              not appear — give them a picture only when they do.
            </Hint>
          )}
          <Button variant="quiet" size="sm" icon="image" onClick={onAddSprite}>
            {npc.sprite.length > 0 ? 'Start again with a new one' : 'Give them a look'}
          </Button>
        </Field>
      )}

      {/* One list, three kinds. They were three sections once, which made
          "affection, then whether she knows, then her standing" three places
          for one thought — and gave no way to order them against each other.
          The kind leads the row, the way it does on the variables screen. */}
      <Field as="div" label="Variables" about={copy('cast.attribute.clamped')}>
        {npc.variables.map((variable, index) => (
          <AttrRow key={index} varName={npcVar(npc.inkId, variable.key)}>
            {/* Every control keeps its `aria-label` as well as the visible one.
                Five variables mean five fields called "Key", and the row each
                belongs to is what tells them apart — for a screen reader and
                for a test alike. The visible label leads the accessible name so
                the two still agree. */}
            <Field label="Type" className="npc-attr-field npc-attr-field--kind">
              <Select
                size="sm"
                aria-label={`Type of ${variable.label}`}
                value={variable.kind}
                onChange={(event) =>
                  patchVariable(index, asKind(variable, event.target.value as NpcVarKind))
                }
              >
                {NPC_VAR_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Key" className="npc-attr-field">
              <Input
                size="sm"
                mono
                aria-label={`Key of ${variable.label}`}
                value={variable.key}
                onChange={(event) =>
                  patchVariable(index, { ...variable, key: inkKey(event.target.value) })
                }
              />
            </Field>
            <Field label="Name" className="npc-attr-field">
              <Input
                size="sm"
                aria-label={`Label of ${variable.key}`}
                value={variable.label}
                onChange={(event) =>
                  patchVariable(index, { ...variable, label: event.target.value })
                }
              />
            </Field>

            {/* Only the fields the kind actually has. A range on a yes/no is a
                control that cannot do anything, and reads as one that is
                broken. */}
            {variable.kind === 'number' && (
              <>
                {(['initial', 'min', 'max'] as const).map((field) => (
                  <Field
                    key={field}
                    label={NUMBER_LABELS[field]}
                    className="npc-attr-field npc-attr-field--number"
                  >
                    <Input
                      size="sm"
                      type="number"
                      aria-label={`${field} of ${variable.key}`}
                      value={Number(variable[field])}
                      onChange={(event) =>
                        patchVariable(index, { ...variable, [field]: Number(event.target.value) })
                      }
                    />
                  </Field>
                ))}
                {/* Where the starting value sits in its range. The number is
                    right there beside it — a bar on its own cannot be read
                    back. */}
                <Meter
                  className="npc-attr-meter"
                  value={Number(variable.initial)}
                  min={variable.min}
                  max={variable.max}
                  title={`${variable.initial} of ${variable.min}–${variable.max}`}
                />
              </>
            )}

            {variable.kind === 'text' && (
              <>
                <Field
                  label="Allowed values"
                  note="comma separated"
                  className="npc-attr-field npc-attr-field--wide"
                >
                <Input
                  size="sm"
                  aria-label={`Allowed values of ${variable.key}`}
                  value={variable.values.join(', ')}
                  onChange={(event) => {
                    const values = event.target.value
                      .split(',')
                      .map((one) => one.trim())
                      .filter((one) => one.length > 0)
                    patchVariable(index, {
                      ...variable,
                      values,
                      // Keeping an initial that is no longer allowed would
                      // generate ink the story could never set back.
                      initial: values.includes(String(variable.initial))
                        ? variable.initial
                        : (values[0] ?? '')
                    })
                  }}
                />
                </Field>
                <Field label="Starts at" className="npc-attr-field">
                  <Select
                    size="sm"
                    aria-label={`Starts at, for ${variable.key}`}
                    value={String(variable.initial)}
                    onChange={(event) =>
                      patchVariable(index, { ...variable, initial: event.target.value })
                    }
                  >
                    {variable.values.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}

            {variable.kind === 'boolean' && (
              <Checkbox
                label="starts true"
                checked={variable.initial === true}
                onChange={(event) =>
                  patchVariable(index, { ...variable, initial: event.target.checked })
                }
              />
            )}

            <IconButton
              icon="x"
              size="sm"
              label={`Remove ${variable.key}`}
              onClick={() =>
                onPatch({ variables: npc.variables.filter((_, at) => at !== index) })
              }
            />
          </AttrRow>
        ))}
        <Button variant="quiet" size="sm" icon="plus" onClick={addVariable}>
          Add a variable
        </Button>
      </Field>

      <Hint>
        Cast attributes share <code>ink/state.ink</code> with the variables, and the
        right-click menu treats them the same.
      </Hint>

      {/* At the foot and named, the way every other detail pane in the game
          editor ends. It used to be an unlabelled trash icon in the header,
          which read as one of the pane's tools rather than as the one action
          here that cannot be undone. */}
      <div className="detail-row detail-row--danger">
        <Button
          variant="danger"
          icon="trash-2"
          // Named, like the other panes: "Remove this character" reads fine on
          // screen, where the pane header says whose it is, and says nothing at
          // all to a reader who arrived at the button alone.
          aria-label={`Remove ${npc.name}`}
          onClick={onRemove}
        >
          Remove this character
        </Button>
      </div>
    </>
  )
}

/** Spelled out above each spinbox; `initial` is not what an author calls it. */
const NUMBER_LABELS = { initial: 'Starts at', min: 'Min', max: 'Max' } as const

function AttrRow({
  varName,
  children
}: {
  varName: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="npc-attr">
      {children}
      <code title="the ink variable this becomes">{varName}</code>
    </div>
  )
}

/** The three kinds, worded for an author rather than for the ink. */
const KIND_LABELS: Record<NpcVarKind, string> = {
  number: 'Number',
  boolean: 'Yes / no',
  text: 'Word'
}

/** A key nothing else on this NPC is using — one namespace per person. */
function uniqueKey(npc: Npc, wanted: string): string {
  const taken = new Set(npc.variables.map((one) => one.key))

  let key = wanted
  for (let suffix = 2; taken.has(key); suffix++) key = `${wanted}_${suffix}`
  return key
}
