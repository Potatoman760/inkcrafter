/** Cards, the catalogue layout, and the compiler strip. */

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Drives the 2px stripe on the top edge, so a board reads at a glance. */
  status?: 'planned' | 'drafting' | 'done' | ''
  selected?: boolean
  interactive?: boolean
}

/**
 * A plan chapter, a codex summary, a picker item.
 *
 * The status is a stripe along the top, never a coloured left border — that
 * belongs to ListRow's selection marker and the two would read as the same
 * thing. Actions go in the head; the foot is monospace metadata only.
 */
export function Card({
  status,
  selected = false,
  interactive = false,
  className = '',
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const classes = [
    'ic-card',
    status ? `ic-card--${status}` : '',
    selected ? 'is-selected' : '',
    interactive ? 'ic-card--interactive' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={classes} {...rest}>
      {status && <span className="ic-card__stripe" />}
      {children}
    </article>
  )
}

export function CardHead({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return <header className="ic-card__head">{children}</header>
}

export function CardTitle({
  onClick,
  className = '',
  children
}: {
  /**
   * Makes the title the way in to editing it, which is how a plan card is
   * renamed. It becomes a button rather than a heading, because a heading
   * that does something on click cannot be reached from the keyboard.
   */
  onClick?: React.MouseEventHandler
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  const classes = ['ic-card__title', className].filter(Boolean).join(' ')
  return onClick ? (
    <button type="button" className={classes} onClick={onClick}>
      {children}
    </button>
  ) : (
    <h3 className={classes}>{children}</h3>
  )
}

export function CardSummary({
  empty = false,
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement> & { empty?: boolean }): React.JSX.Element {
  return (
    <p
      className={['ic-card__summary', empty ? 'is-empty' : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </p>
  )
}

export function CardFoot({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return <footer className="ic-card__foot">{children}</footer>
}

/**
 * The layout every catalogue uses: a filterable list on the left, the selected
 * thing's fields on the right.
 *
 * Stats, items, media, cast and providers are all this shape, which is why it
 * is a component and not five near-misses. The master column never scrolls its
 * filter away — only the list inside it scrolls.
 */
export function MasterDetail({
  master,
  detail,
  masterWidth,
  className = '',
  masterClassName = '',
  detailClassName = ''
}: {
  master: React.ReactNode
  detail: React.ReactNode
  /**
   * Overrides the standard rail width, in pixels. Omit it.
   *
   * Every catalogue used to pass one and they had drifted to five different
   * numbers, so the rail moved whenever a tab changed. The width now lives in
   * `--master-width`, and this is kept only for a pane that genuinely cannot
   * use it.
   */
  masterWidth?: number
  className?: string
  /** The two columns scroll and pad independently, so each takes its own. */
  masterClassName?: string
  detailClassName?: string
}): React.JSX.Element {
  return (
    <div
      className={['ic-master-detail', className].filter(Boolean).join(' ')}
      style={
        masterWidth === undefined
          ? undefined
          : { gridTemplateColumns: `${masterWidth}px 1fr` }
      }
    >
      <div className={['ic-master-detail__master', masterClassName].filter(Boolean).join(' ')}>
        {master}
      </div>
      <div className={['ic-master-detail__detail', detailClassName].filter(Boolean).join(' ')}>
        {detail}
      </div>
    </div>
  )
}

export function MasterList({
  className = '',
  children
}: {
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={['ic-master-detail__list', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

export interface DiagnosticItem {
  severity: 'error' | 'warning' | 'todo'
  message: string
  line?: number | null
  /** Shown before the line number when the problem is in another file. */
  file?: string | null
}

/**
 * The compiler strip along the bottom of the window.
 *
 * Collapses to a status line when clean. Severity sits in a fixed column so
 * messages align, and every row goes to its line: a diagnostic you cannot
 * navigate to is a dead end.
 *
 * Diverges from upstream, which renders each row as a `<div onClick>` — that is
 * unreachable by keyboard, which makes "clickable" true only for a mouse.
 * These are buttons.
 */
export function Diagnostics({
  items = [],
  onSelect,
  emptyLabel = 'No problems',
  className = ''
}: {
  items?: DiagnosticItem[]
  onSelect?: (item: DiagnosticItem) => void
  emptyLabel?: React.ReactNode
  className?: string
}): React.JSX.Element {
  const classes = ['ic-diagnostics', items.length === 0 ? 'is-empty' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <footer className={classes} aria-label="Diagnostics">
      {items.length === 0 ? (
        <p className="ic-hint diagnostics-clean">{emptyLabel}</p>
      ) : (
        items.map((item, index) => (
          <button
            key={index}
            type="button"
            className={`ic-diag ic-diag--${item.severity}`}
            onClick={() => onSelect?.(item)}
          >
            <span className="ic-diag__severity">{item.severity}</span>
            {item.line !== null && item.line !== undefined && (
              <span className="ic-diag__line">
                {item.file ? `${item.file}:` : 'line '}
                {item.line}
              </span>
            )}
            <span className="ic-diag__message">{item.message}</span>
          </button>
        ))
      )}
    </footer>
  )
}
