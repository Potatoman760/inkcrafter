import { Icon, type IconName } from '../Icon'

/** The window toolbar, the tab strips, and a pane's own header. */

export interface TabItem {
  value: string
  label: React.ReactNode
  icon?: IconName
  /** Rendered in parentheses after the label — asset counts, entry counts. */
  count?: number
  /** Tooltip; use it for the keyboard shortcut. */
  hint?: string
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  /**
   * view = the toolbar's primary switch · pane = a pane's uppercase strip ·
   * sub = a second row inside a pane.
   *
   * Three levels at most; a fourth means it is a view.
   */
  level?: 'view' | 'pane' | 'sub'
  /** Right-aligned actions belonging to the strip itself, not to a tab. */
  trail?: React.ReactNode
  label?: string
  className?: string
}

/**
 * Every tab strip in the app.
 *
 * A tab always switches the content of the pane it sits in — never another
 * column. A control that changes a different column is a small lie about what
 * tabs do.
 */
export function Tabs({
  items,
  value,
  onChange,
  level = 'view',
  trail,
  label,
  className = ''
}: TabsProps): React.JSX.Element {
  const classes = [
    'ic-tabs',
    level === 'pane' ? 'ic-tabs--pane' : '',
    level === 'sub' ? 'ic-tabs--sub' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <nav className={classes} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={`ic-tab${item.value === value ? ' is-active' : ''}`}
          title={item.hint}
          onClick={() => onChange(item.value)}
        >
          {item.icon && <Icon name={item.icon} size={13} />}
          {item.label}
          {item.count !== undefined && (
            <span style={{ color: 'var(--text-faint)' }}>({item.count})</span>
          )}
        </button>
      ))}
      {trail && <span className="ic-tabs__trail">{trail}</span>}
    </nav>
  )
}

/**
 * The window toolbar: project identity, the view switch, the open document,
 * then status.
 *
 * The only place global commands may live, and at most two quiet icon buttons
 * of them — everything else belongs to the command palette.
 */
export function Toolbar({
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement>): React.JSX.Element {
  return (
    <header className={['ic-toolbar', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </header>
  )
}

export function ToolbarBrand({
  style,
  className = '',
  children
}: {
  style?: React.CSSProperties
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <span className={['ic-toolbar__brand', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </span>
  )
}

export function ToolbarSpacer(): React.JSX.Element {
  return <span className="ic-toolbar__spacer" />
}

export function ToolbarRule(): React.JSX.Element {
  return <span className="ic-toolbar__rule" />
}

export function ToolbarGroup({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return <span className="ic-toolbar__group">{children}</span>
}

export function ToolbarFile({
  className = '',
  children
}: {
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <span className={['ic-toolbar__file', className].filter(Boolean).join(' ')}>{children}</span>
  )
}

/**
 * A pane's name and its own actions — three at most, quiet or icon-only.
 *
 * Nothing global belongs here; that is the toolbar's job.
 */
export function PaneHeader({
  title,
  actions,
  className = '',
  children
}: {
  title?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={['ic-pane-header', className].filter(Boolean).join(' ')}>
      <span className="ic-pane-header__title">{title}</span>
      {children}
      {actions && <span className="ic-pane-header__actions">{actions}</span>}
    </div>
  )
}

/** An uppercase mono label inside a scrolling list. A label, never a heading. */
export function GroupLabel({
  as: Tag = 'h3',
  children,
  className = ''
}: {
  /**
   * A divergence: the kit renders a `<div>`, but every use of it — here and in
   * the kit's own screens — names the group of rows beneath it, which is what
   * a heading is. Screen-reader users navigate a pane by its headings. Pass
   * `div` for a label that is decorative or that repeats a heading already
   * given.
   */
  as?: 'h3' | 'div'
  children?: React.ReactNode
  className?: string
}): React.JSX.Element {
  return <Tag className={['ic-group-label', className].filter(Boolean).join(' ')}>{children}</Tag>
}
