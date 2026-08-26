import { useEffect, useMemo, useRef, useState } from 'react'
import type { NpcDocument } from '@shared/bundle/npcDoc'
import { formatTag, type TagOp } from '@shared/bundle/tagSpec'
import type { EditorContext } from '@shared/inkContext'
import {
  addCondition,
  addEffect,
  addEffectAtLine,
  addTagAtLine,
  addTagToChoice,
  COMPARISON_LABELS,
  COMPARISONS,
  itemCondition,
  itemEffect,
  removeCondition,
  removeLine,
  renderEffect,
  replaceSpan,
  statEffect,
  type Combine,
  type Comparison,
  type StatChange,
  type TextEdit
} from '@shared/inkEdits'
import {
  assetsOfKind,
  isSingleFileMediaKind,
  type MediaAsset,
  type MediaDocument,
  type MediaVariant
} from '@shared/mediaDoc'
import { DEFAULT_SLOT, STAGE_SLOTS, type StageSlot } from '@shared/bundle/tagSpec'
import { formatMediaTag } from '@shared/mediaTag'
import { INVENTORY, type Item, type StatsDocument } from '@shared/statsDoc'
import {
  conditionFor,
  inkEffectFor,
  tagFor,
  trackableForTag,
  trackablesOf,
  type Trackable
} from '@shared/trackables'
import { Icon } from '../design/Icon'
import {
  Button,
  Checkbox,
  Hint,
  Input,
  Menu,
  MenuItem,
  Segmented,
  Select
} from '../design/components'

export interface MenuTarget {
  /** Where the click landed, in the document. */
  offset: number
  /** Viewport coordinates, for placing the popup. */
  x: number
  y: number
}

interface InkContextMenuProps {
  target: MenuTarget
  source: string
  /** What the click landed on, which decides what is worth offering. */
  context: EditorContext
  stats: StatsDocument
  /** The cast, whose attributes are stats like any other from here. */
  npcs: NpcDocument
  media: MediaDocument
  onApply: (edit: TextEdit) => void
  onClose: () => void
  /** Opens a catalogue, for when the thing wanted is not in one yet. */
  onManage: (which: 'stats' | 'media' | 'cast') => void
}

type Action =
  | 'require'
  | 'give'
  | 'take'
  | 'change'
  | 'background'
  | 'character'
  | 'animation'
  | 'clear'
  | 'autosave'
  | 'music'
  | 'sound'
  | 'stopMusic'
  | 'stopAnimations'
  | 'retarget'
  | 'variant'
  | 'retargetEffect'
  | 'editEffect'
  | 'retargetTag'
  | 'editTag'

type ActionCategory = 'item' | 'stat' | 'stage' | 'audio'

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  item: 'Item',
  stat: 'Variable',
  stage: 'Stage',
  audio: 'Audio'
}

const CATEGORY_ACTIONS: Record<ActionCategory, Action[]> = {
  item: ['give', 'take'],
  stat: ['change'],
  stage: ['background', 'character', 'clear', 'animation', 'stopAnimations'],
  audio: ['sound', 'music', 'stopMusic']
}

/** Short inside a submenu: the category already supplies the missing noun. */
const SUBMENU_LABELS: Partial<Record<Action, string>> = {
  give: 'Give…',
  take: 'Take…',
  change: 'Change…',
  background: 'Set background…',
  character: 'Show character…',
  clear: 'Clear everything',
  animation: 'Show animation…',
  stopAnimations: 'Stop animations',
  sound: 'Play sound effect…',
  music: 'Set music…',
  stopMusic: 'Stop music'
}

const ACTION_LABELS: Record<Action, string> = {
  require: 'Require…',
  give: 'Give item…',
  take: 'Take item…',
  change: 'Change variable…',
  background: 'Set background…',
  character: 'Show character…',
  animation: 'Show animation…',
  stopAnimations: 'Stop the animations',
  clear: 'Clear everything',
  autosave: 'Add autosave checkpoint…',
  music: 'Set music…',
  sound: 'Play sound effect…',
  stopMusic: 'Stop the music',
  retarget: 'Change which…',
  variant: 'Change the look…',
  retargetEffect: 'Change which…',
  editEffect: 'Change what it does…',
  retargetTag: 'Change which…',
  editTag: 'Change what it does…'
}

/** Keeps a hundred rows from all reaching the document at once. */
const VISIBLE = 60

/** What a chosen change turns into, and therefore how it gets written. */
type Written =
  | { as: 'tag'; text: string }
  | { as: 'logic'; text: string }
  | { as: 'condition'; text: string }

const CHANGE_TO_OP: Record<StatChange, TagOp> = { add: '+', subtract: '-', set: '=' }
const OP_TO_CHANGE: Record<TagOp, StatChange> = { '+': 'add', '-': 'subtract', '=': 'set' }

/**
 * Right-clicking in the ink editor.
 *
 * The catalogues exist so this can write correct ink without the author
 * remembering a name, a type or a tag prefix, so everything here is chosen from
 * them rather than typed.
 *
 * What is offered depends on what the click landed on, and that is the point
 * rather than a nicety: on a `# bg:courtyard` line, "change stat" is not a near
 * miss — it is an option that cannot mean anything there. So a media tag offers
 * only what can be done to a media tag, and a line with no choice on it does not
 * offer to gate one.
 *
 * Changes go out as tags and gates as ink, because that is what each half can
 * do: a `# stat:` or `# npc:` tag is applied by the game, which clamps it to the
 * catalogue's range and tells the HUD, while only ink can branch. See
 * [trackables.ts](../../../shared/trackables.ts) for where the line falls.
 */
export function InkContextMenu({
  target,
  source,
  context,
  stats,
  npcs,
  media,
  onApply,
  onClose,
  onManage
}: InkContextMenuProps): React.JSX.Element {
  const [action, setAction] = useState<Action | null>(null)
  const [category, setCategory] = useState<ActionCategory | null>(null)
  /**
   * Where a character walks on.
   *
   * Chosen before the person, because it is a property of the staging rather
   * than of them — and because the list closes the step the moment somebody is
   * picked, so anything asked afterwards would be asked too late.
   */
  const [slot, setSlot] = useState<StageSlot>(DEFAULT_SLOT)
  /**
   * Mirrored, for a sprite drawn facing the wrong way for where it is standing.
   *
   * Asked beside the slot and for the same reason — picking somebody closes the
   * step — but not remembered across menus the way `slot` is: a flip belongs to
   * the tag being written, and carrying it to the next character would mirror
   * somebody nobody asked about.
   */
  const [flipped, setFlipped] = useState(false)
  const [filter, setFilter] = useState('')
  const [chosen, setChosen] = useState<{
    trackable?: Trackable
    item?: Item
    asset?: MediaAsset
  } | null>(null)
  const [variant, setVariant] = useState<MediaVariant | null>(null)

  const [comparison, setComparison] = useState<Comparison>('>=')
  const [amount, setAmount] = useState('1')
  const [word, setWord] = useState('')
  const [change, setChange] = useState<StatChange>('add')
  const [wanted, setWanted] = useState(true)
  const [combine, setCombine] = useState<Combine>('and')

  const popup = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)

  const trackables = useMemo(() => trackablesOf(stats, npcs), [stats, npcs])

  const choice = context.kind === 'choice' ? context.choice : null
  const onMedia = context.kind === 'media' ? context : null
  const onEffect = context.kind === 'effect' ? context : null
  const onStateTag = context.kind === 'stateTag' ? context : null

  /** The catalogue row an existing `# stat:`/`# npc:` line names, if any. */
  const tagged = useMemo(
    () => (onStateTag ? trackableForTag(trackables, onStateTag.tag.command) : null),
    [onStateTag?.tag.command, trackables]
  )

  // Editing starts from what the line already says rather than from defaults,
  // so "change the amount" does not silently reset the operation too.
  useEffect(() => {
    const effect = onEffect?.effect
    if (!effect) return

    if (effect.kind === 'stat') {
      setChange(effect.change)
      setAmount(effect.value)
    } else if (effect.kind === 'flag') {
      setWanted(effect.value)
    } else {
      setWanted(effect.give)
    }
  }, [onEffect?.effect])

  useEffect(() => {
    const command = onStateTag?.tag.command
    if (!command) return

    setChange(OP_TO_CHANGE[command.op])

    if (command.kind === 'stat') {
      setAmount(String(command.value))
      return
    }

    const value = command.value
    if (value === 'true' || value === 'false') setWanted(value === 'true')
    else if (/^-?\d+$/.test(value)) setAmount(value)
    setWord(value)
  }, [onStateTag?.tag.command])

  const back = (): void => {
    setAction(null)
    setCategory(null)
    setChosen(null)
    setVariant(null)
    setFilter('')
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (action || category) back()
      else onClose()
    }

    const onDown = (event: MouseEvent): void => {
      if (!popup.current?.contains(event.target as Node)) onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onDown)
    }
  }, [action, category, onClose])

  useEffect(() => {
    if (action && action !== 'clear' && action !== 'autosave') search.current?.focus()
  }, [action])

  const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (haystack: string): boolean =>
    terms.every((term) => haystack.toLowerCase().includes(term))

  /**
   * Which half of the vocabulary an action is about.
   *
   * Retargeting stays inside the channel the line is already written in: a `~`
   * line may be pointed at another player stat, a `# npc:` line at another cast
   * attribute. Moving one across would rewrite which machinery applies it, which
   * is not what "change which" means.
   */
  const trackableFilter = ((): ((one: Trackable) => boolean) | null => {
    if (action === 'require' || action === 'change') return () => true
    if (action === 'retargetEffect') {
      // An item line retargets to another item, never to a stat.
      if (onEffect?.effect.kind === 'item') return null
      return (one) => one.source === 'player'
    }
    if (action === 'retargetTag') {
      const current = onStateTag?.tag.command.kind
      return (one) =>
        one.channel === 'tag' &&
        (current === 'npc' ? one.source === 'cast' : one.source === 'player')
    }
    return null
  })()

  const showItems =
    action === 'require' ||
    action === 'give' ||
    action === 'take' ||
    (action === 'retargetEffect' && onEffect?.effect.kind === 'item')

  const mediaKind =
    action === 'background'
      ? 'background'
      : action === 'character'
        ? 'character'
        : action === 'animation'
          ? 'animation'
          : action === 'music'
            ? 'music'
            : action === 'sound'
              ? 'sound'
              : action === 'retarget'
                ? (onMedia?.tag.ref.kind ?? null)
                : null

  const candidateTrackables = useMemo(
    () =>
      trackableFilter
        ? trackables.filter(
            (one) => trackableFilter(one) && matches(`${one.variable} ${one.label} ${one.search}`)
          )
        : [],
    [trackables, filter, action, onStateTag?.tag.command.kind]
  )

  /** The picker's headings, in the order the catalogues declare them. */
  const groups = useMemo(() => {
    const seen: string[] = []
    for (const one of candidateTrackables) if (!seen.includes(one.group)) seen.push(one.group)
    return seen
  }, [candidateTrackables])

  const candidateItems = useMemo(
    () =>
      showItems
        ? stats.items.filter((item) => matches(`${item.name} ${item.display} ${item.category}`))
        : [],
    [stats.items, filter, showItems]
  )

  const candidateAssets = useMemo(
    () =>
      mediaKind
        ? assetsOfKind(media, mediaKind).filter((asset) =>
            matches(`${asset.name} ${asset.display} ${asset.tags.join(' ')}`)
          )
        : [],
    [media, filter, mediaKind]
  )

  /** The looks on offer when changing the one an existing tag names. */
  const looks = ((): MediaVariant[] => {
    if (action !== 'variant' || !onMedia) return []
    const asset = assetsOfKind(media, onMedia.tag.ref.kind).find(
      (candidate) => candidate.name === onMedia.tag.ref.name
    )
    return asset?.variants ?? []
  })()

  const wantsMedia = mediaKind !== null || action === 'variant'
  const emptyCatalogue =
    action === null ||
    action === 'clear' ||
    action === 'autosave' ||
    action === 'stopMusic' ||
    action === 'stopAnimations' ||
    action === 'editEffect' ||
    action === 'editTag'
      ? false
      : wantsMedia
        ? media.assets.length === 0
        : trackables.length === 0 && stats.items.length === 0

  /** The row a change is about: whatever was just picked, else what is there. */
  const subject = chosen?.trackable ?? (action === 'editTag' ? tagged : null)

  /** The value to write for the subject, from whichever control it uses. */
  const valueOf = (one: Trackable): string => {
    if (one.kind === 'flag') return wanted ? 'true' : 'false'
    if (one.kind === 'text') return word || one.values[0] || ''
    return amount || '0'
  }

  /** A change to something tracked, written down whichever way applies to it. */
  const changeOf = (one: Trackable): Written | null => {
    const value = valueOf(one)

    if (one.channel === 'tag') {
      // A yes/no or a word is set, never added to, whatever the dropdown last said.
      const op = one.kind === 'number' ? CHANGE_TO_OP[change] : '='
      const command = tagFor(one, op, value)
      return command ? { as: 'tag', text: formatTag(command) } : null
    }

    return { as: 'logic', text: inkEffectFor(one, change, value) }
  }

  /** What this will write, shown before it is written. */
  const preview = ((): Written | null => {
    if (!action) return null
    if (action === 'clear') return { as: 'tag', text: 'clear' }
    if (action === 'autosave') return { as: 'tag', text: 'autosave' }
    // Said out loud because silence is not what a scene falls back to: the
    // track holds until something ends it.
    if (action === 'stopMusic') return { as: 'tag', text: 'music:stop' }
    if (action === 'stopAnimations') return { as: 'tag', text: 'anim:none' }

    // Editing a `# stat:`/`# npc:` line. Retargeting keeps what it does; editing
    // keeps what it acts on.
    if (action === 'retargetTag' || action === 'editTag') {
      if (subject) return changeOf(subject)
      // The line names somebody the catalogue has never heard of. Its own text
      // is still the honest preview — the menu has nothing better to offer.
      return onStateTag ? { as: 'tag', text: formatTag(onStateTag.tag.command) } : null
    }

    // Editing a `~` line: whatever was not changed keeps what it already said.
    if ((action === 'retargetEffect' || action === 'editEffect') && onEffect) {
      const current = onEffect.effect

      if (current.kind === 'item') {
        const item = chosen?.item?.name ?? current.item
        return { as: 'logic', text: renderEffect({ ...current, item, give: wanted }) }
      }

      if (subject) {
        // Still a `~` line: this edits the one that is there rather than
        // replacing the channel it was written in.
        return {
          as: 'logic',
          text:
            subject.kind === 'number'
              ? statEffect(subject.variable, change, amount || '0')
              : inkEffectFor(subject, 'set', valueOf(subject))
        }
      }

      if (current.kind === 'flag') return { as: 'logic', text: renderEffect({ ...current, value: wanted }) }
      return { as: 'logic', text: renderEffect({ ...current, change, value: amount || '0' }) }
    }

    if (action === 'variant') {
      if (!onMedia || !variant) return null
      const asset = assetsOfKind(media, onMedia.tag.ref.kind).find(
        (candidate) => candidate.name === onMedia.tag.ref.name
      )
      const tag = asset ? formatMediaTag(asset, variant) : null
      return tag ? { as: 'tag', text: tag } : null
    }

    if (
      action === 'background' ||
      action === 'character' ||
      action === 'animation' ||
      action === 'music' ||
      action === 'sound' ||
      action === 'retarget'
    ) {
      const asset = chosen?.asset
      if (!asset) return null
      // Only backgrounds and characters reach here, and both have a tag.
      const tag = formatMediaTag(asset, variant ?? asset.variants[0] ?? null)
      if (tag === null) return null

      // Said out loud even for the middle. A bare tag already means centre, so
      // this is longer than it needs to be — and a scene's staging reads off
      // the page without knowing that rule.
      // Only somebody who stands somewhere takes a slot. An animation fills
      // the frame, so there is nothing for `at left` to mean — but it can still
      // be turned round, which is about the artwork rather than the position.
      // So can a background, which is artwork before it is anywhere at all.
      const positioned = action === 'character' ? `${tag} at ${slot}` : tag
      const turnable =
        action === 'character' || action === 'animation' || action === 'background'
      return { as: 'tag', text: turnable && flipped ? `${positioned} flipped` : positioned }
    }

    if (!chosen) return null
    const { trackable, item } = chosen

    if (action === 'require') {
      if (item) return { as: 'condition', text: itemCondition(INVENTORY, item.name, wanted) }
      if (!trackable) return null
      return {
        as: 'condition',
        text: conditionFor(trackable, comparison, valueOf(trackable))
      }
    }

    if (action === 'change' && trackable) return changeOf(trackable)

    if (item) return { as: 'logic', text: itemEffect(INVENTORY, item.name, action === 'give') }
    return null
  })()

  const editing =
    action === 'retarget' ||
    action === 'variant' ||
    action === 'retargetEffect' ||
    action === 'editEffect' ||
    action === 'retargetTag' ||
    action === 'editTag'

  const apply = (): void => {
    if (!preview) return

    // Editing what is already there replaces it in place; everything else is a
    // new line.
    if (editing && onMedia) {
      onApply(replaceSpan(onMedia.tag, preview.text))
      onClose()
      return
    }

    if (onStateTag && (action === 'retargetTag' || action === 'editTag')) {
      onApply(replaceSpan(onStateTag.tag, preview.text))
      onClose()
      return
    }

    if (onEffect && (action === 'retargetEffect' || action === 'editEffect')) {
      onApply(replaceSpan(onEffect, preview.text))
      onClose()
      return
    }

    // A gate has nowhere to go without a choice, and it is never offered
    // without one. Writing it as a loose `~` line would be worse than nothing.
    if (preview.as === 'condition' && !choice) return

    const edit =
      preview.as === 'condition' && choice
        ? addCondition(choice, preview.text, combine)
        : preview.as === 'tag'
          ? choice
            ? addTagToChoice(choice, preview.text)
            : addTagAtLine(source, target.offset, preview.text, context.kind === 'header')
          : choice
            ? addEffect(choice, preview.text)
            : addEffectAtLine(source, target.offset, preview.text)

    onApply(edit)
    onClose()
  }

  /**
   * A media tag offers only what can be done to a media tag. Elsewhere the
   * effects and the tags both apply, and a gate needs a choice to hang on.
   */
  const actions: Action[] = onMedia
    ? isSingleFileMediaKind(onMedia.tag.ref.kind)
      ? ['retarget']
      : ['retarget', 'variant']
    : onStateTag
      ? ['retargetTag', 'editTag']
      : onEffect
        ? ['retargetEffect', 'editEffect']
        : choice
          ? [
              'require',
              'autosave',
              'give',
              'take',
              'change',
              'background',
              'character',
              'clear',
              'animation',
              'sound',
              'music'
            ]
          : [
              'autosave',
              'background',
              'character',
              'animation',
              'stopAnimations',
              'clear',
              'sound',
              'music',
              'stopMusic',
              'give',
              'take',
              'change'
            ]

  /** Existing lines already have a focused two-action menu. New insertions are
   * the crowded case, so their actions are grouped by the thing they affect. */
  const grouped = !onMedia && !onStateTag && !onEffect
  const actionCategories = (Object.keys(CATEGORY_ACTIONS) as ActionCategory[]).filter((candidate) =>
    CATEGORY_ACTIONS[candidate].some((candidateAction) => actions.includes(candidateAction))
  )
  const categoryActions = category
    ? CATEGORY_ACTIONS[category].filter((candidate) => actions.includes(candidate))
    : []

  // Clamped so a click near the bottom of the window does not open a menu
  // mostly off screen.
  const style: React.CSSProperties = {
    left: Math.min(target.x, window.innerWidth - 300),
    top: Math.min(target.y, window.innerHeight - 340)
  }

  /** Open toward the document when the pointer is too close to the right edge. */
  const flyoutToLeft = target.x > window.innerWidth - 470

  /** The controls for a change, shared by inserting one and editing one. */
  const valueControls = (one: Trackable, gating: boolean): React.JSX.Element => (
    <>
      {one.kind === 'flag' && (
        <Select
          aria-label="Value"
          value={wanted ? 'true' : 'false'}
          onChange={(event) => setWanted(event.target.value === 'true')}
        >
          <option value="true">{gating ? 'is set' : 'set to yes'}</option>
          <option value="false">{gating ? 'is not set' : 'set to no'}</option>
        </Select>
      )}

      {one.kind === 'text' &&
        (one.values.length > 0 ? (
          <Select
            aria-label="Which"
            value={word || one.values[0]}
            onChange={(event) => setWord(event.target.value)}
          >
            {one.values.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        ) : (
          <Input className="ink-menu-amount"
            aria-label="Which"
            value={word}
            onChange={(event) => setWord(event.target.value)}
          />
        ))}

      {one.kind === 'number' && (
        <>
          {gating ? (
            <Select
              aria-label="Comparison"
              value={comparison}
              onChange={(event) => setComparison(event.target.value as Comparison)}
            >
              {COMPARISONS.map((operator) => (
                <option key={operator} value={operator}>
                  {COMPARISON_LABELS[operator]}
                </option>
              ))}
            </Select>
          ) : (
            <Select
              aria-label="Change"
              value={change}
              onChange={(event) => setChange(event.target.value as StatChange)}
            >
              <option value="add">add</option>
              <option value="subtract">subtract</option>
              <option value="set">set to</option>
            </Select>
          )}
          <Input className="ink-menu-amount"
            aria-label="Amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          {one.max !== null && !gating && (
            <span className="ink-menu-range">
              0–{one.max} in the catalogue; the game clamps it
            </span>
          )}
        </>
      )}
    </>
  )

  return (
    <Menu
      className={`ink-menu${action ? ' is-picker' : ''}`}
      style={style}
      ref={popup}
      aria-label="Ink actions"
    >
      {!action ? (
        <>
          {onStateTag && !tagged && (
                <Hint>
                  Nothing in the catalogues is called{' '}
                  <code>
                    {onStateTag.tag.command.kind === 'npc'
                      ? `${onStateTag.tag.command.id} ${onStateTag.tag.command.attr}`
                      : onStateTag.tag.command.stat}
                  </code>
                  , so this line changes nothing at runtime.
                </Hint>
          )}

          {(grouped
            ? actions.filter((candidate) => candidate === 'require' || candidate === 'autosave')
            : actions
          ).map(
            (candidate) => (
              <MenuItem key={candidate} onClick={() => setAction(candidate)}>
                {ACTION_LABELS[candidate]}
              </MenuItem>
            )
          )}

          {grouped &&
            actionCategories.map((candidate) => (
              <div
                className="ink-menu-submenu"
                key={candidate}
                onMouseEnter={() => setCategory(candidate)}
                onMouseLeave={() => setCategory((current) => current === candidate ? null : current)}
              >
                <MenuItem
                  aria-haspopup="menu"
                  aria-expanded={category === candidate}
                  onFocus={() => setCategory(candidate)}
                  onClick={() => setCategory(candidate)}
                >
                    {CATEGORY_LABELS[candidate]}
                    <Icon className="ink-menu-submenu-mark" name="chevron-right" size={13} />
                </MenuItem>
                {category === candidate && (
                  <Menu
                    className={`ink-menu-flyout${flyoutToLeft ? ' is-left' : ''}`}
                    aria-label={`${CATEGORY_LABELS[candidate]} actions`}
                  >
                    {categoryActions.map((candidateAction) => (
                      <MenuItem key={candidateAction} onClick={() => setAction(candidateAction)}>
                        {SUBMENU_LABELS[candidateAction] ?? ACTION_LABELS[candidateAction]}
                      </MenuItem>
                    ))}
                  </Menu>
                )}
              </div>
            ))}

          {(onMedia || onEffect || onStateTag) && (
            <MenuItem
              onClick={() => {
                onApply(removeLine(source, context.line))
                onClose()
              }}
            >
              {onMedia ? 'Remove this tag line' : 'Remove this line'}
            </MenuItem>
          )}

          {choice?.condition && (
            <MenuItem
              onClick={() => {
                const edit = removeCondition(source, choice)
                if (edit) onApply(edit)
                onClose()
              }}
            >
              Remove the gate <code>{choice.condition.text}</code>
            </MenuItem>
          )}

        </>
      ) : (
        <>
          <div className="ink-menu-head">
            <Button variant="link" onClick={back}>
              <Icon name="chevron-left" size={13} />back
            </Button>
            <span>{ACTION_LABELS[action]}</span>
          </div>

          {action === 'editEffect' || action === 'editTag' ? (
            <Hint>
              Reshaping{' '}
              <code>
                {onEffect ? renderEffect(onEffect.effect) : formatTag(onStateTag!.tag.command)}
              </code>
              . What it acts on stays as it is — use “Change which…” for that.
            </Hint>
          ) : action === 'clear' ? (
            <Hint>
              The whole stage is empty from here on: the background is removed, every character
              leaves, and every animation stops. Music continues unchanged.
            </Hint>
          ) : action === 'autosave' ? (
            <Hint>
              Save the reader’s progress once the next stable frame is on screen. Autosaves rotate,
              so this adds a checkpoint without interrupting play.
            </Hint>
          ) : action === 'stopMusic' ? (
            <Hint>
              Silence from here on. A track holds across lines and knots until something ends it,
              so this is the only way to say it.
            </Hint>
          ) : action === 'stopAnimations' ? (
            <Hint>
              Every animation stopped. They hold across lines the way the cast does, and this ends
              them without taking anybody off screen.
            </Hint>
          ) : emptyCatalogue ? (
            <Hint>
              Nothing in the {wantsMedia ? 'media' : 'variables'} catalogue yet.{' '}
              <Button variant="link" onClick={() => onManage(wantsMedia ? 'media' : 'stats')}>
                Add some
              </Button>
              .
            </Hint>
          ) : (
            <>
              {action === 'sound' && (
                <Hint>
                  Play this cue once when the tagged paragraph begins. It does not loop or carry
                  into later lines.
                </Hint>
              )}
              {/* Before the list, because picking somebody closes this step —
                  asked afterwards it would be asked too late. */}
              {(action === 'character' ||
                action === 'animation' ||
                action === 'background') && (
                <div className="ink-menu-config">
                  {action === 'character' && (
                    <Segmented
                      label="Where they stand"
                      value={slot}
                      options={STAGE_SLOTS.map((one) => ({ value: one, label: one }))}
                      onChange={(next) => setSlot(next as StageSlot)}
                    />
                  )}
                  {/* A person and an effect face a way; a place does not. Same
                      tag word for all three — the label is only about what is
                      being turned. */}
                  <Checkbox
                    label={
                      action === 'background' ? 'Mirrored left to right' : 'Facing the other way'
                    }
                    checked={flipped}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setFlipped(event.target.checked)
                    }
                  />
                </div>
              )}

              {action !== 'variant' && (
                <Input
                  ref={search} className="ink-menu-filter"
                  value={filter}
                  aria-label="Filter"
                  placeholder="Filter…"
                  onChange={(event) => setFilter(event.target.value)}
                />
              )}

              <div className="ink-menu-list">
                {groups.map((group) => (
                  <div key={group}>
                    <h4>{group}</h4>
                    {candidateTrackables
                      .filter((one) => one.group === group)
                      .slice(0, VISIBLE)
                      .map((one) => (
                        <button
                          key={one.key}
                          className={`ink-menu-pick ${
                            chosen?.trackable?.key === one.key ? 'is-chosen' : ''
                          }`}
                          onClick={() => {
                            setChosen({ trackable: one })
                            setWord(one.values[0] ?? '')
                          }}
                        >
                          <code>{one.variable}</code>
                          <span>{one.label}</span>
                        </button>
                      ))}
                  </div>
                ))}

                {candidateItems.length > 0 && <h4>Items</h4>}
                {candidateItems.slice(0, VISIBLE).map((item) => (
                  <button
                    key={item.id}
                    className={`ink-menu-pick ${chosen?.item?.id === item.id ? 'is-chosen' : ''}`}
                    onClick={() => setChosen({ item })}
                  >
                    <code>{item.name}</code>
                    <span>{item.display || item.category}</span>
                  </button>
                ))}

                {candidateAssets.slice(0, VISIBLE).map((asset) => (
                  <button
                    key={asset.id}
                    className={`ink-menu-pick ${chosen?.asset?.id === asset.id ? 'is-chosen' : ''}`}
                    onClick={() => {
                      setChosen({ asset })
                      setVariant(asset.variants[0] ?? null)
                    }}
                  >
                    <code>{asset.name}</code>
                    <span>
                      {asset.display ||
                        (isSingleFileMediaKind(asset.kind)
                          ? (asset.variants[0]?.file ?? 'No file')
                          : `${asset.variants.length} look${asset.variants.length === 1 ? '' : 's'}`)}
                    </span>
                  </button>
                ))}

                {looks.map((candidate) => (
                  <button
                    key={candidate.id}
                    className={`ink-menu-pick ${variant?.id === candidate.id ? 'is-chosen' : ''}`}
                    onClick={() => setVariant(candidate)}
                  >
                    <code>{candidate.name}</code>
                    <span>{candidate.file}</span>
                  </button>
                ))}

                {candidateTrackables.length === 0 &&
                  candidateItems.length === 0 &&
                  candidateAssets.length === 0 &&
                  looks.length === 0 && <Hint>Nothing matches.</Hint>}
              </div>
            </>
          )}

          {/* A look to go with the asset just chosen, when there is a choice of them. */}
          {chosen?.asset &&
            !isSingleFileMediaKind(chosen.asset.kind) &&
            chosen.asset.variants.length > 1 &&
            action !== 'variant' && (
            <div className="ink-menu-config">
              <Select
                aria-label="Which look"
                value={variant?.id ?? ''}
                onChange={(event) =>
                  setVariant(
                    chosen.asset?.variants.find((look) => look.id === event.target.value) ?? null
                  )
                }
              >
                {chosen.asset.variants.map((look) => (
                  <option key={look.id} value={look.id}>
                    {look.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Editing a `#` state tag. */}
          {onStateTag && (action === 'retargetTag' || action === 'editTag') && subject && (
            <div className="ink-menu-config">{valueControls(subject, false)}</div>
          )}

          {/* Editing a `~` logic line. */}
          {onEffect && (action === 'retargetEffect' || action === 'editEffect') && (
            <div className="ink-menu-config">
              {(chosen?.item || (!subject && onEffect.effect.kind === 'item')) && (
                <Select
                  aria-label="Give or take"
                  value={wanted ? 'give' : 'take'}
                  onChange={(event) => setWanted(event.target.value === 'give')}
                >
                  <option value="give">give it</option>
                  <option value="take">take it away</option>
                </Select>
              )}

              {subject && valueControls(subject, false)}

              {!subject && onEffect.effect.kind === 'flag' && (
                <Select
                  aria-label="Value"
                  value={wanted ? 'true' : 'false'}
                  onChange={(event) => setWanted(event.target.value === 'true')}
                >
                  <option value="true">set to yes</option>
                  <option value="false">set to no</option>
                </Select>
              )}

              {!subject && onEffect.effect.kind === 'stat' && (
                <>
                  <Select
                    aria-label="Change"
                    value={change}
                    onChange={(event) => setChange(event.target.value as StatChange)}
                  >
                    <option value="add">add</option>
                    <option value="subtract">subtract</option>
                    <option value="set">set to</option>
                  </Select>
                  <Input className="ink-menu-amount"
                    aria-label="Amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </>
              )}
            </div>
          )}

          {/* Inserting something new. */}
          {chosen && !chosen.asset && !onEffect && !onStateTag && (
            <div className="ink-menu-config">
              {chosen.item && action === 'require' && (
                <Select
                  aria-label="Held or not"
                  value={wanted ? 'has' : 'hasnt'}
                  onChange={(event) => setWanted(event.target.value === 'has')}
                >
                  <option value="has">is carried</option>
                  <option value="hasnt">is not carried</option>
                </Select>
              )}

              {chosen.trackable && valueControls(chosen.trackable, action === 'require')}

              {action === 'require' && choice?.condition && (
                <Select
                  aria-label="Combine with the existing gate"
                  value={combine}
                  onChange={(event) => setCombine(event.target.value as Combine)}
                >
                  <option value="and">and also</option>
                  <option value="or">or instead</option>
                </Select>
              )}
            </div>
          )}

          {preview && (
            <div className="ink-menu-apply">
              {/* What will be written, before it is. */}
              <code>
                {preview.as === 'tag'
                  ? `# ${preview.text}`
                  : preview.as === 'condition'
                    ? choice?.condition
                      ? `{${choice.condition.text} ${combine} ${preview.text}}`
                      : `{${preview.text}}`
                    : `~ ${preview.text}`}
              </code>
              <Button variant="primary" onClick={apply}>
                {editing ? 'Change' : 'Insert'}
              </Button>
            </div>
          )}
        </>
      )}
    </Menu>
  )
}
