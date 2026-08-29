import { Icon, type IconName } from '../Icon'

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'ic-btn--xs',
  sm: 'ic-btn--sm',
  md: '',
  lg: 'ic-btn--lg'
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * default = neutral action · primary = the pane's one commit · danger =
   * destructive · quiet = toolbar and pane header · link = reversible inline
   * action.
   *
   * At most one `primary` per pane, and `danger` never sits beside it —
   * destruction goes in a menu or the far left of a dialog footer.
   */
  variant?: 'default' | 'primary' | 'danger' | 'quiet' | 'link'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Lucide name, drawn before the label. */
  icon?: IconName
  /** Drawn after the label — for a verb whose direction matters, like send. */
  iconAfter?: IconName
  block?: boolean
}

/**
 * The one button. Variant carries the meaning, never the size or colour.
 *
 * `type="button"` by default: every button in this app that has ever wanted to
 * submit a form says so, and the default swallowed an Enter key more than once.
 */
export function Button({
  variant = 'default',
  size = 'md',
  icon,
  iconAfter,
  block = false,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  const classes = [
    'ic-btn',
    variant !== 'default' ? `ic-btn--${variant}` : '',
    SIZES[size],
    block ? 'ic-btn--block' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} size={size === 'lg' ? 15 : 13} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={13} />}
    </button>
  )
}
