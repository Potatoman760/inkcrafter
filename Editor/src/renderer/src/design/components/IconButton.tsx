import { Icon, type IconName } from '../Icon'

const SIZES: Record<NonNullable<IconButtonProps['size']>, string> = {
  xs: 'ic-iconbtn--xs',
  sm: 'ic-iconbtn--sm',
  md: '',
  lg: 'ic-iconbtn--lg'
}

const GLYPH: Record<NonNullable<IconButtonProps['size']>, number> = {
  xs: 12,
  sm: 14,
  md: 14,
  lg: 16
}

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconName
  /** Required: it is both the accessible name and the tooltip. */
  label: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Toggled on, e.g. a dock panel that is showing. */
  active?: boolean
}

/**
 * A square icon-only control.
 *
 * Only where the icon is unambiguous — close, expand, reveal, toggle, move.
 * Anything an author would have to guess at gets a Button with words.
 */
export function IconButton({
  icon,
  label,
  size = 'md',
  active = false,
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps): React.JSX.Element {
  const classes = ['ic-iconbtn', SIZES[size], active ? 'is-active' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={classes}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      {...rest}
    >
      <Icon name={icon} size={GLYPH[size]} />
    </button>
  )
}
