import { isVideoFile } from '@shared/mediaDoc'
import { Icon, type IconName } from '../Icon'

/** Badges, chips and thumbnails — the small things that sit on a row. */

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * accent = entry point / active · branch = choices, diverts · warn = needs
   * attention · zero = an empty count.
   *
   * A count of zero renders as `zero` rather than being hidden: an author needs
   * to see that nothing mentions an entry.
   */
  variant?: 'default' | 'accent' | 'branch' | 'warn' | 'zero'
}

/** A count or one-word state on a row. Never clickable. */
export function Badge({
  variant = 'default',
  className = '',
  children,
  ...rest
}: BadgeProps): React.JSX.Element {
  const classes = ['ic-badge', variant !== 'default' ? `ic-badge--${variant}` : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  )
}

export interface ChipProps {
  /** detected = inferred by the app, not typed by the author (dashed) · accent = linked/active */
  variant?: 'default' | 'detected' | 'accent'
  mono?: boolean
  /** Renders the × affordance. `removeLabel` names what it removes. */
  onRemove?: React.MouseEventHandler
  removeLabel?: string
  onClick?: React.MouseEventHandler
  title?: string
  className?: string
  children?: React.ReactNode
}

/**
 * A tag, a cast member, an attached file. Always inside a ChipRow.
 *
 * `detected` is reserved for things InkCrafter inferred — it tells the author
 * what they did not write.
 */
export function Chip({
  variant = 'default',
  mono = false,
  onRemove,
  removeLabel = 'Remove',
  onClick,
  title,
  className = '',
  children
}: ChipProps): React.JSX.Element {
  const classes = [
    'ic-chip',
    variant !== 'default' ? `ic-chip--${variant}` : '',
    mono ? 'ic-chip--mono' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={classes} title={title}>
      {onClick ? (
        <button type="button" onClick={onClick}>
          {children}
        </button>
      ) : (
        <span>{children}</span>
      )}
      {onRemove && (
        <button type="button" className="ic-chip__x" aria-label={removeLabel} onClick={onRemove}>
          <Icon name="x" size={10} />
        </button>
      )}
    </li>
  )
}

/** The wrapping row chips must sit in — chips are list items. */
export function ChipRow({
  className = '',
  children
}: {
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return <ul className={['ic-chips', className].filter(Boolean).join(' ')}>{children}</ul>
}

const THUMB_SIZES: Record<NonNullable<ThumbProps['size']>, string> = {
  sm: 'ic-thumb--sm',
  md: 'ic-thumb--md',
  wide: 'ic-thumb--wide'
}

export interface ThumbProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string | null
  alt?: string
  /**
   * What a missing file shows. The word only fits the larger sizes; a small
   * thumb wants a mark.
   */
  missingLabel?: React.ReactNode
  size?: 'sm' | 'md' | 'wide'
  /** Referenced but absent from media/ — draws dashed red. */
  missing?: boolean
  /** Shown when there is no image: a kind, an extension, a count. */
  label?: React.ReactNode
}

/**
 * Media asset preview. The checkerboard shows transparency honestly.
 *
 * A `<span>` rather than the upstream `<div>`: these sit inside row buttons and
 * paragraph text, where a block element is invalid.
 */
export function Thumb({
  src,
  alt = '',
  size = 'md',
  missing = false,
  missingLabel = 'missing',
  label,
  className = '',
  ...rest
}: ThumbProps): React.JSX.Element {
  const classes = ['ic-thumb', THUMB_SIZES[size], missing ? 'is-missing' : '', className]
    .filter(Boolean)
    .join(' ')

  const still = !src || missing || !isVideoFile(src)

  return (
    <span className={classes} {...rest}>
      {!src || missing ? (
        <span>{missing ? missingLabel : label}</span>
      ) : still ? (
        <img src={src} alt={alt} />
      ) : (
        // A clip's first frame, standing in for the picture it has not got.
        // `#t=0.1` is what draws it: a <video> that has only loaded its
        // metadata paints nothing, and every thumbnail on the panel would be a
        // black rectangle. Not playing, on purpose — a list of them all looping
        // at once is a lot of decoding to say what a scene looks like.
        <video src={`${src}#t=0.1`} preload="metadata" muted playsInline />
      )}
    </span>
  )
}

/**
 * A stand-in for imagery that does not exist yet, saying what belongs there.
 *
 * Never draw a placeholder illustration — a striped box with `sprite 512×1024`
 * on it is honest, and a borrowed picture is not.
 */
export function Placeholder({
  label,
  className = '',
  style
}: {
  label: React.ReactNode
  className?: string
  style?: React.CSSProperties
}): React.JSX.Element {
  return (
    <div className={['ic-placeholder', className].filter(Boolean).join(' ')} style={style}>
      {label}
    </div>
  )
}

/**
 * Everything a row is, plus what a `<button>` already was.
 *
 * Extending the button's own props rather than listing handlers one at a time:
 * the file tree needs draggable, onDragStart and onContextMenu, and the next
 * list will need something else again. `children` is omitted because a row is
 * built from `name`, `meta` and `trail` — passing children instead would render
 * a row that quietly ignored them.
 */
export interface ListRowProps
  extends Omit<React.ComponentPropsWithRef<'button'>, 'children' | 'title' | 'name'> {
  name: React.ReactNode
  /** Second line: a path, a tag list, a count phrase. */
  meta?: React.ReactNode
  /** One icon vocabulary per list — every row has one, or none does. */
  icon?: IconName
  selected?: boolean
  /** Unsaved: an amber dot after the name. */
  dirty?: boolean
  /** The name is an identifier the author could type into ink. */
  mono?: boolean
  /**
   * Right-aligned badges. Not buttons — this renders a `<button>`, and a button
   * inside a button is invalid; put controls beside the row, not in it.
   */
  trail?: React.ReactNode
  className?: string
  title?: string
  onClick?: React.MouseEventHandler
}

/**
 * The single row primitive: files, codex entries, stats, items, media, models,
 * providers.
 *
 * Selection is a surface change *plus* a 2px left marker, so it survives a
 * light theme and colour-blindness, and so a row can be selected and focused at
 * once without the two signals fighting.
 */
export function ListRow({
  name,
  meta,
  icon,
  selected = false,
  dirty = false,
  mono = false,
  trail,
  className = '',
  ...rest
}: ListRowProps): React.JSX.Element {
  const classes = [
    'ic-row',
    selected ? 'is-selected' : '',
    dirty ? 'ic-row--dirty' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} aria-current={selected || undefined} {...rest}>
      {icon && <Icon name={icon} size={13} className="ic-row__icon" />}
      <span className="ic-row__body">
        <span className={`ic-row__name${mono ? ' ic-row__name--mono' : ''}`}>{name}</span>
        {meta && <span className="ic-row__meta">{meta}</span>}
      </span>
      {trail && <span className="ic-row__trail">{trail}</span>}
    </button>
  )
}
