import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_SLOT,
  STAGE_SLOTS,
  type ActiveRule,
  type StageSlot,
  type TagCommand
} from '@shared/bundle/tagSpec'
import type { MediaAsset, MediaDocument, MediaKind, MediaVariant } from '@shared/mediaDoc'
import type { MediaFile } from '@shared/types'
import {
  Button,
  Checkbox,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Segmented,
  Thumb
} from '../design/components'

/**
 * Choosing what to stage.
 *
 * Adding and changing ask different questions, and the menu opens on whichever
 * one is being asked. Adding is "who?" and starts on the whole cast. Changing
 * Kael's row is not — it is "what about Kael?", so it starts on Kael: his
 * looks, and the side he is standing on. Swapping him for somebody else is
 * still one item away, but it is a different act and not the first thing put
 * in front of you.
 *
 * That mirrors the ink, which is the point. One `#` line stages one thing, and
 * the row for it edits that line and nothing else.
 *
 * The same choices the editor's right-click menu offers, asked in a panel
 * rather than at a cursor. It is a sibling of `InkContextMenu` rather than an
 * extraction from it: that component is nine hundred lines built around
 * `EditorContext` and `TextEdit`, which are offsets into a source string the
 * manuscript does not have. The two share what is actually shared — the tag
 * grammar in `tagSpec`, and the catalogue lookups — and nothing else. If both
 * settle, the asset list is the piece worth pulling out into one component.
 */

interface PickerProps {
  media: MediaDocument
  files: MediaFile[]
  /** Where to hang the menu, in viewport coordinates. */
  at: { x: number; y: number }
  onClose: () => void
}

/** Dismissed by anything that is not a choice from it. */
function useDismiss(onClose: () => void): React.RefObject<HTMLDivElement | null> {
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Where the pointer landed rather than whether the event was stopped: a
    // React handler stopping propagation does not reliably outrun a listener on
    // `window`, and when it loses, the menu closes before the click reaches the
    // item. `FileTree` learned this the same way.
    const close = (event: Event): void => {
      const target = event.target
      if (target instanceof Element && target.closest('.tag-picker')) return
      onClose()
    }

    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
    }
  }, [onClose])

  return box
}

/** A look's `app://` URL, for the thumbnail beside its name. */
function thumbOf(files: MediaFile[], variant: MediaVariant | undefined): string | undefined {
  if (!variant) return undefined
  return files.find((file) => file.path === variant.file)?.url
}

/**
 * Pick an asset of one kind, then a look, then — for a character — where they
 * stand.
 *
 * Where is asked *before* who, because picking somebody finishes the menu, and
 * asking afterwards would be asking too late. The same order the editor's menu
 * settled on, for the same reason.
 */
export function MediaPicker({
  media,
  files,
  at,
  kind,
  title,
  withSlot = false,
  withBackdrop = false,
  selected,
  otherLabel,
  onPick,
  onClose,
  extra
}: PickerProps & {
  kind: MediaKind
  title: string
  withSlot?: boolean
  /**
   * The two settings a background carries of its own: whether a clip loops, and
   * whether the art is mirrored.
   */
  withBackdrop?: boolean
  /** What is staged now, when a row is being changed rather than added. */
  selected?: {
    name: string
    variant: string | null
    slot?: StageSlot
    flipped?: boolean
    once?: boolean
  } | null
  /** What the item back to the whole list says: "Show somebody else…". */
  otherLabel?: string
  onPick: (
    asset: MediaAsset,
    variant: MediaVariant | null,
    slot: StageSlot | null,
    flipped: boolean,
    once: boolean
  ) => void
  /** An action that is not an asset — "none", "stop the music". */
  extra?: { label: string; onPick: () => void }
}): React.JSX.Element {
  const box = useDismiss(onClose)
  const [filter, setFilter] = useState('')

  const staged = selected
    ? (media.assets.find((one) => one.kind === kind && one.name === selected.name) ?? null)
    : null

  /**
   * Whether opening on the staged asset has anything to offer.
   *
   * A character always does, because they can be moved. A background with one
   * look has nothing to change but its identity, and a menu whose only item is
   * "another background" is a worse way of saying that than the list itself.
   */
  const openOnStaged =
    staged !== null && kind !== 'music' && (withSlot || staged.variants.length > 1)

  const [chosen, setChosen] = useState<MediaAsset | null>(openOnStaged ? staged : null)
  // Where somebody already stands, so that changing only their look does not
  // quietly walk them back to the middle.
  const [slot, setSlot] = useState<StageSlot>(selected?.slot ?? DEFAULT_SLOT)
  // Which way she faces, opened on how she is drawn now for the same reason as
  // the slot: changing only her look must not quietly turn her round.
  const [flipped, setFlipped] = useState(selected?.flipped ?? false)
  const [once, setOnce] = useState(selected?.once ?? false)

  const assets = media.assets
    .filter((asset) => asset.kind === kind)
    .filter((asset) => asset.name.includes(filter.trim().toLowerCase()))

  /** The look staged now, or the first one, for an edit that only moves them. */
  const staying = (asset: MediaAsset): MediaVariant | null =>
    asset.variants.find((one) => one.name === selected?.variant) ?? asset.variants[0] ?? null

  /**
   * The slot control, on whichever step is first.
   *
   * Moving somebody already on stage is the edit, not a setting for one: when
   * the menu opened on them, choosing a side writes it and closes, the way
   * every other item in the menu does. Left as a setting it did nothing at all
   * until a look was clicked afterwards, which is not a step anybody would
   * guess at — and moving a character without changing their expression is the
   * commonest staging change there is.
   *
   * Adding is different and keeps the old behaviour: there is nobody to move
   * yet, so the side is a choice made ahead of picking who.
   */
  const where = withSlot ? (
    <div className="picker-slot">
      <Segmented
        label="Where they stand"
        value={slot}
        onChange={(next) => {
          const side = next as StageSlot
          setSlot(side)
          if (openOnStaged && chosen) onPick(chosen, staying(chosen), side, flipped, once)
        }}
        options={STAGE_SLOTS.map((one) => ({ value: one, label: one }))}
      />

      {/* Written on the tag rather than remembered, so this is a property of
          the line being edited and not of the character. Committing on change,
          like the side, because it is the whole edit when it is the only thing
          asked for. */}
      <Checkbox
        label="Facing the other way"
        checked={flipped}
        onChange={(event) => {
          const turned = event.target.checked
          setFlipped(turned)
          if (openOnStaged && chosen) onPick(chosen, staying(chosen), slot, turned, once)
        }}
      />
    </div>
  ) : null

  /**
   * A background's own two settings.
   *
   * Committed against whatever is staged rather than only against `chosen`,
   * unlike the character controls above: a background with one look never opens
   * on itself, so waiting for a second step would leave both of these doing
   * nothing at all for most backgrounds.
   */
  const backdrop = withBackdrop ? (
    <div className="picker-slot">
      <Checkbox
        label="Play once and hold the last frame"
        checked={once}
        onChange={(event) => {
          const playOnce = event.target.checked
          setOnce(playOnce)
          const background = chosen ?? staged
          if (background) {
            onPick(background, staying(background), null, flipped, playOnce)
          }
        }}
      />
      {/* The same word the tag uses, and the same word a character's flip uses.
          A place drawn receding to the right is a second place once turned. */}
      <Checkbox
        label="Mirrored left to right"
        checked={flipped}
        onChange={(event) => {
          const turned = event.target.checked
          setFlipped(turned)
          const background = chosen ?? staged
          if (background) {
            onPick(background, staying(background), null, turned, once)
          }
        }}
      />
    </div>
  ) : null

  return (
    <Menu
      ref={box}
      className="tag-picker"
      aria-label={title}
      label={chosen ? chosen.name : title}
      style={{ position: 'fixed', left: at.x, top: at.y }}
    >
      {!chosen && (
        <>
          {where}
          {backdrop}

          {media.assets.filter((asset) => asset.kind === kind).length > 4 && (
            <div className="picker-filter">
              <Input
                value={filter}
                aria-label="Filter by name"
                placeholder="name…"
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
          )}

          {assets.map((asset) => (
            <MenuItem
              key={asset.id}
              aria-checked={selected?.name === asset.name}
              className={selected?.name === asset.name ? 'is-current' : ''}
              onClick={() => {
                // One look and nothing to choose between: skip the second step
                // rather than asking a question with one answer.
                if (kind === 'music' || asset.variants.length <= 1) {
                  onPick(asset, asset.variants[0] ?? null, withSlot ? slot : null, flipped, once)
                  return
                }
                setChosen(asset)
              }}
            >
              <Thumb
                className="picker-thumb"
                src={thumbOf(files, asset.variants[0])}
                missing={false}
              />
              {asset.name}
            </MenuItem>
          ))}

          {assets.length === 0 && (
            <MenuItem disabled>
              {media.assets.some((asset) => asset.kind === kind)
                ? 'Nothing by that name.'
                : `No ${kind} in the catalogue yet.`}
            </MenuItem>
          )}

          {extra && (
            <MenuItem icon="x" onClick={extra.onPick}>
              {extra.label}
            </MenuItem>
          )}
        </>
      )}

      {chosen && (
        <>
          {where}
          {backdrop}

          {chosen.variants.map((variant) => (
            <MenuItem
              key={variant.id}
              aria-checked={selected?.name === chosen.name && selected.variant === variant.name}
              className={
                selected?.name === chosen.name && selected.variant === variant.name
                  ? 'is-current'
                  : ''
              }
              onClick={() => onPick(chosen, variant, withSlot ? slot : null, flipped, once)}
            >
              <Thumb className="picker-thumb" src={thumbOf(files, variant)} missing={false} />
              {variant.name}
            </MenuItem>
          ))}
          {chosen.variants.length === 0 && <MenuItem disabled>No looks filed yet.</MenuItem>}

          <MenuSeparator />

          {/* One step away, because swapping who is on stage is a different act
              from changing their look — and the row was clicked to do the
              second one. */}
          <MenuItem
            icon={openOnStaged ? 'users' : 'chevron-left'}
            onClick={() => setChosen(null)}
          >
            {openOnStaged ? (otherLabel ?? title) : 'Back'}
          </MenuItem>

          {openOnStaged && extra && (
            <MenuItem icon="x" onClick={extra.onPick}>
              {extra.label}
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  )
}

/** Who is speaking. Free text, because a speaker is a name and not an id. */
export function SpeakerPicker({
  at,
  current,
  onPick,
  onClose
}: {
  at: { x: number; y: number }
  current: string
  onPick: (command: TagCommand) => void
  onClose: () => void
}): React.JSX.Element {
  const box = useDismiss(onClose)
  const [name, setName] = useState(current)

  return (
    <Menu
      ref={box}
      className="tag-picker"
      aria-label="Who is speaking"
      label="Who is speaking"
      style={{ position: 'fixed', left: at.x, top: at.y }}
    >
      <div className="picker-change">
        <Input
          value={name}
          aria-label="Speaker"
          placeholder="Wren"
          onChange={(event) => setName(event.target.value)}
        />
        <Button icon="check" onClick={() => onPick({ kind: 'speaker', name: name.trim() })}>
          Save
        </Button>
      </div>
    </Menu>
  )
}

/**
 * Who the frame leans on.
 *
 * `speaker` is the default and needs no tag, so choosing it here is how a line
 * hands the choice back rather than holding it forever.
 */
export function ActivePicker({
  media,
  at,
  current,
  onPick,
  onClose
}: {
  media: MediaDocument
  at: { x: number; y: number }
  current: ActiveRule
  onPick: (command: TagCommand) => void
  onClose: () => void
}): React.JSX.Element {
  const box = useDismiss(onClose)

  const rules: { key: string; label: string; rule: ActiveRule }[] = [
    { key: 'auto', label: 'whoever is speaking', rule: { rule: 'speaker' } },
    { key: 'nobody', label: 'nobody', rule: { rule: 'nobody' } },
    ...media.assets
      .filter((asset) => asset.kind === 'character')
      .map((asset) => ({
        key: asset.id,
        label: asset.name,
        rule: { rule: 'character' as const, name: asset.name }
      }))
  ]

  const named = (rule: ActiveRule): string | null => (rule.rule === 'character' ? rule.name : null)
  const same = (rule: ActiveRule): boolean =>
    rule.rule === current.rule && named(rule) === named(current)

  return (
    <Menu
      ref={box}
      className="tag-picker"
      aria-label="Who the frame leans on"
      label="Who the frame leans on"
      style={{ position: 'fixed', left: at.x, top: at.y }}
    >
      {rules.map((one) => (
        <MenuItem
          key={one.key}
          aria-checked={same(one.rule)}
          className={same(one.rule) ? 'is-current' : ''}
          onClick={() => onPick({ kind: 'active', active: one.rule })}
        >
          {one.label}
        </MenuItem>
      ))}
    </Menu>
  )
}

/**
 * A number the story keeps track of, and what this scene does to it.
 *
 * Free text for the name rather than a list, because the trackables live in two
 * different catalogues and the rail is not the place to teach that distinction.
 * What it *is* strict about is the shape: `parseTag` refuses a stat whose value
 * is not an integer, and a tag that will not parse is a tag the game ignores.
 */
export function ChangePicker({
  at,
  editing,
  onPick,
  onClose
}: {
  at: { x: number; y: number }
  /**
   * The change being edited, when one is. `attr` marks it as a cast attribute
   * rather than a number, which is what decides the shape of the form.
   */
  editing?: { stat: string; op: '+' | '-' | '='; value: number; attr?: string } | null
  onPick: (command: TagCommand) => void
  onClose: () => void
}): React.JSX.Element {
  const box = useDismiss(onClose)
  const [name, setName] = useState(editing?.stat ?? '')
  const [amount, setAmount] = useState(String(editing?.value ?? 1))
  const [op, setOp] = useState<'+' | '-' | '='>(editing?.op ?? '+')
  // Only when editing a cast attribute. Adding one is not offered here: two
  // name fields on the common path would be a question most authors do not
  // have, and `# npc:` is written from the cast screen or by hand.
  const [attr, setAttr] = useState(editing?.attr ?? '')

  const stat = name.trim()
  const value = Number(amount)
  const named = /^[A-Za-z_]\w*$/.test(stat)
  const forCast = editing?.attr !== undefined
  const usable = forCast
    ? named && /^[A-Za-z_]\w*$/.test(attr.trim()) && amount.trim().length > 0
    : named && Number.isInteger(value)

  const write = (): void =>
    onPick(
      forCast
        ? { kind: 'npc', id: stat, attr: attr.trim(), op, value: amount.trim() }
        : { kind: 'stat', stat, op, value }
    )

  return (
    <Menu
      ref={box}
      className="tag-picker"
      aria-label="Change something the story tracks"
      label={editing ? 'Change this' : 'Change something the story tracks'}
      style={{ position: 'fixed', left: at.x, top: at.y }}
    >
      <div className="picker-change">
        <Input
          value={name}
          aria-label={forCast ? 'Who' : 'What to change'}
          placeholder="courage"
          onChange={(event) => setName(event.target.value)}
        />
        {forCast && (
          <Input
            value={attr}
            aria-label="What about them"
            placeholder="affection"
            onChange={(event) => setAttr(event.target.value)}
          />
        )}
        <Segmented
          label="How"
          value={op}
          onChange={(next) => setOp(next as '+' | '-' | '=')}
          options={[
            { value: '+', label: 'up by' },
            { value: '-', label: 'down by' },
            { value: '=', label: 'set to' }
          ]}
        />
        <Input
          value={amount}
          aria-label="By how much"
          onChange={(event) => setAmount(event.target.value)}
        />
        <Button icon={editing ? 'check' : 'plus'} disabled={!usable} onClick={write}>
          {editing ? 'Save' : 'Add'}
        </Button>
      </div>
    </Menu>
  )
}
