import { useState } from 'react'
import {
  DEFAULT_SLOT,
  formatTag,
  type StageSlot,
  type TagCommand,
  type TagOp
} from '@shared/bundle/tagSpec'
import type { MediaAsset, MediaDocument, MediaVariant } from '@shared/mediaDoc'
import type { ResolvedMedia } from '@shared/mediaTag'
import {
  declaresAnimation,
  declaresCharacter,
  declaresKind,
  eventsOf,
  rawOf,
  type SectionScene
} from '@shared/sectionScene'
import type { MediaFile } from '@shared/types'
import { Chip, ChipRow, Hint, Icon, IconButton, Thumb, type IconName } from '../design/components'
import { ActivePicker, ChangePicker, MediaPicker, SpeakerPicker } from './TagPicker'

/**
 * What the reader is looking at, beside the words.
 *
 * The manuscript reads a branching story as one novel, and the `#` lines that
 * stage it were invisible in that reading — a tag-only line showed up as a blank
 * paragraph and nothing else. This is the friendly view of them: the background,
 * who is standing where, the music, and what the scene does to the numbers.
 *
 * Two things are shown differently on purpose, and the difference is the whole
 * idea. A background *holds* — a section that never mentions one is still in the
 * last one set — so it reads faint when it was carried in and solid when this
 * section set it. A stat change does not hold: "courage went up" is not still
 * true two scenes later, so those appear only on the section that wrote them.
 *
 * Closed, the rail shows only what this section changed, which is what makes the
 * manuscript scannable: a section that merely inherits its scene looks quiet,
 * and the places the scene turns are visible from across the page. It shows
 * them by name, though, not as glyphs — a column of grey icons says a change
 * happened here without saying what to, which is most of the question. Read
 * down a chapter it should say "and here it moves to the harbour".
 *
 * The same distinction decides what taking a row away *means*, which is the one
 * thing here that is not obvious. Removing something this section set deletes
 * its tag. Removing something it inherited cannot — there is no line here to
 * delete — so it writes the tag that says "not any more": `# bg: none`,
 * `# hide: wren`, `# music: stop`.
 *
 * Clicking a row opens the same menu that adds one, with what is there already
 * selected. Editing something inherited is therefore not a special case: the
 * menu opens on the inherited value and the choice is written into this
 * section, which is what an author means by changing the background halfway
 * through a scene.
 */

interface RailProps {
  scene: SectionScene
  media: MediaDocument
  files: MediaFile[]
  /** Open when the author has this section selected. */
  open: boolean
  /**
   * Writes one tag into this section, replacing whatever spoke to its subject —
   * or the tag named by `replacing`, which is what changing a row does.
   */
  onSet: (command: TagCommand, replacing?: string) => void
  /** Takes one tag out of this section, named by exactly the text in the file. */
  onClear: (raw: string) => void
}

interface RailRow {
  key: string
  icon: IconName
  label: string
  detail?: string
  thumb?: string
  /** True when this section set it; false when it was carried in. */
  here: boolean
}

/** A look's `app://` URL, or undefined when the file is not in the folder. */
function urlOf(files: MediaFile[], found: ResolvedMedia): string | undefined {
  return files.find((file) => `media/${file.path}` === found.path)?.url
}

/** How a look is named in the rail: `wren`, or `wren/happy` when it has a look. */
function nameOf(found: ResolvedMedia): string {
  return found.variant.name ? `${found.asset.name}/${found.variant.name}` : found.asset.name
}

/**
 * The standing state of a section, as rows.
 *
 * Exported for the tests, which are about which rows appear and which read as
 * this section's own — the part that would be tedious to assert through markup
 * and easy to get wrong in it.
 */
export function railRows(scene: SectionScene, files: MediaFile[]): RailRow[] {
  const { after } = scene
  const rows: RailRow[] = []

  if (after.background) {
    rows.push({
      key: 'bg',
      icon: 'image',
      label: nameOf(after.background),
      detail:
        [after.backgroundOnce ? 'plays once' : '', after.backgroundFlipped ? 'flipped' : '']
          .filter(Boolean)
          .join(' · ') || undefined,
      thumb: urlOf(files, after.background),
      here: declaresKind(scene, 'bg')
    })
  } else if (declaresKind(scene, 'bg')) {
    // Turning something off is a change like any other, and the rail is the
    // only place it is visible: without this row an author who took the
    // background out would see no sign of having done it, and no way back.
    // Only where it was declared, though — carried forward, "no background"
    // would sit on every section after it saying nothing.
    rows.push({ key: 'bg', icon: 'image', label: 'no background', here: true })
  }

  for (const character of after.characters) {
    rows.push({
      key: `char:${character.asset.name}`,
      icon: 'users',
      label: nameOf(character),
      detail: [
        after.slots[character.asset.name] ?? DEFAULT_SLOT,
        after.flipped[character.asset.name] ? 'flipped' : ''
      ]
        .filter(Boolean)
        .join(' · '),
      thumb: urlOf(files, character),
      here: declaresCharacter(scene, character.asset.name)
    })
  }

  for (const animation of after.animations) {
    rows.push({
      key: `anim:${animation.asset.name}`,
      icon: 'sparkles',
      label: nameOf(animation),
      // No slot: an animation fills the frame rather than taking a third of it.
      detail: after.animFlipped[animation.asset.name] ? 'flipped' : undefined,
      thumb: urlOf(files, animation),
      here: declaresAnimation(scene, animation.asset.name)
    })
  }

  if (after.animations.length === 0 && declaresKind(scene, 'anim')) {
    rows.push({ key: 'anim', icon: 'sparkles', label: 'animations stopped', here: true })
  }

  if (after.music) {
    rows.push({
      key: 'music',
      icon: 'music',
      label: nameOf(after.music),
      here: declaresKind(scene, 'music')
    })
  } else if (declaresKind(scene, 'music')) {
    rows.push({ key: 'music', icon: 'music', label: 'music stopped', here: true })
  }

  if (after.speaker) {
    rows.push({
      key: 'speaker',
      icon: 'message-circle',
      label: after.speaker,
      here: declaresKind(scene, 'speaker')
    })
  }

  // Somebody this section took off stage. Like the other off states, only where
  // it was declared: a character hidden three scenes ago is not news here, and
  // there is nothing left of them to show.
  for (const command of scene.declared) {
    if (command.kind !== 'hide') continue
    if (after.characters.some((one) => one.asset.name === command.name)) continue

    rows.push({
      key: `hide:${command.name}`,
      icon: 'users',
      label: command.name,
      detail: 'hidden',
      here: true
    })
  }

  if (after.characters.length === 0 && declaresKind(scene, 'clear')) {
    rows.push({ key: 'clear', icon: 'users', label: 'stage cleared', here: true })
  }

  if (after.activeRule.rule !== 'speaker') {
    rows.push({
      key: 'active',
      icon: 'eye',
      label: after.activeRule.rule === 'nobody' ? 'nobody' : after.activeRule.name,
      here: declaresKind(scene, 'active')
    })
  }

  // Only when off. The map being available is the default, and a row saying so
  // on every section would be noise standing in for information.
  if (!after.mapEnabled) {
    rows.push({ key: 'map', icon: 'map', label: 'map off', here: declaresKind(scene, 'map') })
  }

  return rows
}

/** Which picker is open, where it was opened from, and what it is changing. */
interface Picking {
  kind: 'background' | 'character' | 'animation' | 'music' | 'speaker' | 'active' | 'change'
  x: number
  y: number
  /**
   * The tag being rewritten, by its exact text.
   *
   * Only set when this section actually wrote one. Editing an inherited row
   * leaves it undefined and the write becomes an insert, which is right: the
   * line being changed is somewhere else entirely, and this section is where
   * the author asked for the change.
   */
  replacing?: string
  /** What the row shows now, so the menu opens on it rather than on nothing. */
  selected?: {
    name: string
    variant: string | null
    slot?: StageSlot
    flipped?: boolean
    once?: boolean
  }
  editing?: { stat: string; op: TagOp; value: number; attr?: string }
  current?: string
}

/** The command that takes a row off the stage from here on. */
function offStage(key: string): TagCommand | null {
  if (key === 'bg') return { kind: 'bg', name: null, variant: null, once: false, flipped: false }
  if (key === 'music') return { kind: 'music', name: null, variant: null }
  if (key === 'speaker') return { kind: 'speaker', name: '' }
  if (key === 'active') return { kind: 'active', active: { rule: 'speaker' } }
  if (key === 'map') return { kind: 'map', enabled: true }
  if (key === 'anim') return { kind: 'anim', name: null, variant: null, flipped: false }
  if (key.startsWith('char:')) return { kind: 'hide', name: key.slice(5) }
  // `hide` names a thing on the stage rather than a kind of thing, so it takes
  // an animation off as readily as a character.
  if (key.startsWith('anim:')) return { kind: 'hide', name: key.slice(5) }
  if (key.startsWith('hide:')) return null
  return null
}

/** The tag as written that a row came from, when this section wrote one. */
function rawFor(scene: SectionScene, key: string): string | null {
  if (key === 'clear') return rawOf(scene, (one) => one.kind === 'clear')
  if (key === 'bg') return rawOf(scene, (one) => one.kind === 'bg')
  if (key === 'music') return rawOf(scene, (one) => one.kind === 'music')
  if (key === 'speaker') return rawOf(scene, (one) => one.kind === 'speaker')
  if (key === 'active') return rawOf(scene, (one) => one.kind === 'active')
  if (key === 'map') return rawOf(scene, (one) => one.kind === 'map')

  if (key === 'anim') return rawOf(scene, (one) => one.kind === 'anim' && one.name === null)

  if (key.startsWith('char:')) {
    const name = key.slice(5)
    return rawOf(scene, (one) => one.kind === 'show' && one.name === name)
  }

  if (key.startsWith('anim:')) {
    const name = key.slice(5)
    return rawOf(scene, (one) => one.kind === 'anim' && one.name === name)
  }

  if (key.startsWith('hide:')) {
    const name = key.slice(5)
    return rawOf(scene, (one) => one.kind === 'hide' && one.name === name)
  }

  return null
}

export function SectionRail({
  scene,
  media,
  files,
  open,
  onSet,
  onClear
}: RailProps): React.JSX.Element {
  const [picking, setPicking] = useState<Picking | null>(null)
  const rows = railRows(scene, files)
  const events = eventsOf(scene)
  const { unresolved } = scene.after

  if (!open) {
    const changed = rows.filter((row) => row.here)

    return (
      <div className="section-rail is-closed">
        {changed.map((row) => (
          <div key={row.key} className="rail-brief">
            {row.thumb === undefined ? (
              <Icon name={row.icon} size={13} />
            ) : (
              <Thumb className="rail-thumb" src={row.thumb} missing={false} />
            )}
            <span className="rail-name">{row.label}</span>
            {/* "kael" alone reads as though he was shown; "kael hidden" is
                what happened. The slot carries the same way — where somebody
                stands is worth scanning for. */}
            {row.detail && <span className="rail-detail">{row.detail}</span>}
          </div>
        ))}

        {events.map((command, at) => (
          <div key={`e${at}`} className="rail-brief">
            <Icon name="gauge" size={13} />
            <span className="rail-name">{formatTag(command)}</span>
          </div>
        ))}

        {unresolved.length > 0 && (
          <div className="rail-brief is-wrong">
            <Icon name="triangle-alert" size={13} />
            <span className="rail-name">{unresolved.length} not found</span>
          </div>
        )}
      </div>
    )
  }

  const openAt = (kind: Picking['kind']) => (event: React.MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setPicking({ kind, x: box.left, y: box.bottom + 4 })
  }

  /**
   * Opens the menu for a row, on what that row already shows.
   *
   * The map is the exception and is a plain toggle: it has two states, and a
   * menu of two items would be a worse way of saying so than the click itself.
   */
  const edit = (row: RailRow) => (event: React.MouseEvent<HTMLElement>) => {
    const { after } = scene
    const replacing = rawFor(scene, row.key) ?? undefined

    if (row.key === 'map') {
      onSet({ kind: 'map', enabled: !after.mapEnabled }, replacing)
      return
    }

    const box = event.currentTarget.getBoundingClientRect()
    const where = { x: box.left, y: box.bottom + 4, replacing }

    if (row.key === 'bg') {
      setPicking({
        ...where,
        kind: 'background',
        selected: after.background
          ? {
              name: after.background.asset.name,
              variant: after.background.variant.name,
              once: after.backgroundOnce,
              flipped: after.backgroundFlipped
            }
          : undefined
      })
      return
    }

    if (row.key === 'music') {
      setPicking({
        ...where,
        kind: 'music',
        selected: after.music
          ? { name: after.music.asset.name, variant: after.music.variant.name }
          : undefined
      })
      return
    }

    if (row.key === 'speaker') {
      setPicking({ ...where, kind: 'speaker', current: after.speaker })
      return
    }

    if (row.key === 'active') {
      setPicking({ ...where, kind: 'active' })
      return
    }

    // A hidden character opens the same menu, on them: choosing them again is
    // how they come back, and `show` and `hide` are one subject to the writer,
    // so it rewrites the line that hid them rather than sitting under it.
    if (row.key.startsWith('anim:')) {
      const name = row.key.slice(5)
      const running = after.animations.find((one) => one.asset.name === name)
      setPicking({
        ...where,
        kind: 'animation',
        selected: {
          name,
          variant: running?.variant.name ?? null,
          flipped: after.animFlipped[name] ?? false
        }
      })
      return
    }

    if (row.key.startsWith('char:') || row.key.startsWith('hide:')) {
      const name = row.key.slice(5)
      const standing = after.characters.find((one) => one.asset.name === name)
      setPicking({
        ...where,
        kind: 'character',
        selected: {
          name,
          variant: standing?.variant.name ?? null,
          slot: after.slots[name] ?? DEFAULT_SLOT,
          flipped: after.flipped[name] ?? false
        }
      })
      return
    }

    // `clear` and the off states have nothing to choose between; the only thing
    // to do with them is take them away, which the X already does.
  }

  /** Editing one of the changes this section makes, from its chip. */
  const editChange = (command: TagCommand) => (event: React.MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const where = { x: box.left, y: box.bottom + 4, replacing: formatTag(command) }

    if (command.kind === 'stat') {
      setPicking({ ...where, kind: 'change', editing: { ...command } })
      return
    }

    if (command.kind === 'npc') {
      setPicking({
        ...where,
        kind: 'change',
        editing: {
          stat: command.id,
          attr: command.attr,
          op: command.op,
          value: Number(command.value)
        }
      })
    }
  }

  /**
   * Taking a row away.
   *
   * Deleting the tag when this section wrote one, and writing the tag that says
   * "not any more" when it did not — because a section that merely inherited a
   * background has no line here to delete, and doing nothing would look broken.
   */
  const take = (row: RailRow): void => {
    const raw = row.here ? rawFor(scene, row.key) : null
    if (raw !== null) {
      onClear(raw)
      return
    }

    const command = offStage(row.key)
    if (command) onSet(command)
  }

  const pick = (
    asset: MediaAsset,
    variant: MediaVariant | null,
    slot: StageSlot | null,
    flipped: boolean,
    once: boolean
  ): void => {
    const name = asset.name
    const look = variant?.name ?? null
    // Read before the state is cleared: this same menu both adds and changes,
    // and forgetting the tag it opened on is how changing a character would
    // leave the old one standing.
    const replacing = picking?.replacing
    const kind = picking?.kind

    setPicking(null)
    if (kind === 'character') onSet({ kind: 'show', name, variant: look, slot, flipped }, replacing)
    else if (kind === 'animation') onSet({ kind: 'anim', name, variant: look, flipped }, replacing)
    else if (kind === 'music') onSet({ kind: 'music', name, variant: null }, replacing)
    else onSet({ kind: 'bg', name, variant: look, once, flipped }, replacing)
  }

  const empty = rows.length === 0 && events.length === 0 && unresolved.length === 0

  return (
    <div className="section-rail is-open">
      <div className="rail-label">The scene here</div>

      {empty && <Hint tight>Nothing staged yet.</Hint>}

      {rows.map((row) => (
        <div key={row.key} className={`rail-row ${row.here ? 'is-here' : 'is-inherited'}`}>
          <button
            type="button"
            className="rail-open"
            // Named rather than left to its contents: the row reads
            // "wren/neutral left", which says what is staged but not what
            // pressing it does.
            aria-label={`Change ${row.label}`}
            title={`Change ${row.label}`}
            onClick={edit(row)}
          >
            {row.thumb === undefined ? (
              <Icon name={row.icon} size={13} />
            ) : (
              <Thumb className="rail-thumb" src={row.thumb} missing={false} />
            )}
            <span className="rail-name">{row.label}</span>
            {row.detail && <span className="rail-detail">{row.detail}</span>}
          </button>
          <IconButton
            icon="x"
            size="sm"
            label={row.here ? `Remove ${row.label}` : `Take ${row.label} out from here`}
            onClick={() => take(row)}
          />
        </div>
      ))}

      {events.length > 0 && (
        <ChipRow>
          {events.map((command, at) => (
            <Chip
              key={at}
              title={`Change ${formatTag(command)}`}
              onClick={editChange(command)}
              onRemove={() => onClear(formatTag(command))}
            >
              {formatTag(command)}
            </Chip>
          ))}
        </ChipRow>
      )}

      {unresolved.map((raw) => (
        <Hint key={raw} tone="error" tight>
          <code>#{raw}</code> names nothing in the catalogue.
        </Hint>
      ))}

      <div className="rail-add">
        <IconButton icon="image" size="sm" label="Set the background" onClick={openAt('background')} />
        <IconButton icon="users" size="sm" label="Show a character" onClick={openAt('character')} />
        <IconButton
          icon="sparkles"
          size="sm"
          label="Show an animation"
          onClick={openAt('animation')}
        />
        <IconButton icon="music" size="sm" label="Set the music" onClick={openAt('music')} />
        <IconButton icon="gauge" size="sm" label="Change something tracked" onClick={openAt('change')} />
        <IconButton
          icon="save"
          size="sm"
          label="Add an autosave checkpoint"
          onClick={() => onSet({ kind: 'autosave' })}
        />
      </div>

      {picking?.kind === 'change' && (
        <ChangePicker
          at={picking}
          editing={picking.editing}
          onPick={(command) => {
            setPicking(null)
            onSet(command, picking.replacing)
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {picking?.kind === 'speaker' && (
        <SpeakerPicker
          at={picking}
          current={picking.current ?? ''}
          onPick={(command) => {
            setPicking(null)
            onSet(command, picking.replacing)
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {picking?.kind === 'active' && (
        <ActivePicker
          media={media}
          at={picking}
          current={scene.after.activeRule}
          onPick={(command) => {
            setPicking(null)
            onSet(command, picking.replacing)
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {picking &&
        (picking.kind === 'background' ||
          picking.kind === 'character' ||
          picking.kind === 'animation' ||
          picking.kind === 'music') && (
        <MediaPicker
          media={media}
          files={files}
          at={picking}
          kind={picking.kind}
          withSlot={picking.kind === 'character'}
          withBackdrop={picking.kind === 'background'}
          selected={picking.selected}
          otherLabel={
            picking.kind === 'character'
              ? 'Somebody else…'
              : picking.kind === 'animation'
                ? 'Another animation…'
                : picking.kind === 'music'
                  ? 'Another track…'
                  : 'Another background…'
          }
          title={
            picking.kind === 'background'
              ? 'Set the background'
              : picking.kind === 'character'
                ? 'Show a character'
                : picking.kind === 'animation'
                  ? 'Show an animation'
                  : 'Set the music'
          }
          extra={
            picking.kind === 'animation'
              ? {
                  label: 'Stop the animations',
                  onPick: () => (
                    setPicking(null),
                    onSet({ kind: 'anim', name: null, variant: null, flipped: false }, picking.replacing)
                  )
                }
              : picking.kind === 'character'
              ? {
                  label: 'Clear the stage',
                  // Not `replacing`: clearing the stage speaks for everybody,
                  // so rewriting one character's line as a clear would be a
                  // wider change than the author asked for.
                  onPick: () => (setPicking(null), onSet({ kind: 'clear' }))
                }
              : picking.kind === 'music'
                ? {
                    label: 'Stop the music',
                    onPick: () => (
                      setPicking(null),
                      onSet({ kind: 'music', name: null, variant: null }, picking.replacing)
                    )
                  }
                : {
                    label: 'No background',
                    onPick: () => (
                      setPicking(null),
                      onSet({ kind: 'bg', name: null, variant: null, once: false, flipped: false }, picking.replacing)
                    )
                  }
          }
          onPick={pick}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}
