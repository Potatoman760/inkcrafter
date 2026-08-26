/** State, emptiness and measurement. */

export interface MeterProps {
  value: number
  min?: number
  max?: number
  tone?: 'branch' | 'signal' | 'caution' | 'alert'
  className?: string
  title?: string
}

const TONES: Record<NonNullable<MeterProps['tone']>, string> = {
  branch: 'var(--accent-branch)',
  signal: 'var(--accent-signal)',
  caution: 'var(--accent-caution)',
  alert: 'var(--accent-alert)'
}

/**
 * A 4px bar showing a value inside its range.
 *
 * Always paired with the number in text — the bar is the shape, not the value,
 * and a bar on its own cannot be read back.
 */
export function Meter({
  value,
  min = 0,
  max = 100,
  tone = 'branch',
  className = '',
  title
}: MeterProps): React.JSX.Element {
  const ratio = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)))

  return (
    <div
      className={['ic-meter', className].filter(Boolean).join(' ')}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      title={title}
    >
      <div className="ic-meter__fill" style={{ width: `${ratio * 100}%`, background: TONES[tone] }} />
    </div>
  )
}

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** ok = compiled · error = compile failed · warn = compiled with warnings · busy = compiling or saving (the dot pulses) */
  state?: 'idle' | 'ok' | 'error' | 'warn' | 'busy'
}

/**
 * Compile and save state, at the right end of the toolbar and nowhere else.
 *
 * One pill per window — status that appears in two places is status nobody
 * trusts. The copy is a fact with a number — "2 errors", "3 warnings" — never
 * "All good".
 *
 * Which is why the ok state has no copy at all here: there is no fact worth a
 * word when nothing is wrong. Upstream fills it with "Compiled in 32ms", but
 * how long the compiler took is a fact about the compiler rather than about
 * the story, and it changed on every keystroke in the corner of the author's
 * eye. Pass no children for that state and give the pill a label instead — a
 * dot alone is mute.
 */
export function StatusPill({
  state = 'idle',
  className = '',
  children,
  ...rest
}: StatusPillProps): React.JSX.Element {
  const classes = ['ic-pill', state !== 'idle' ? `ic-pill--${state}` : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} role="status" {...rest}>
      <span className="ic-pill__dot" />
      {children}
    </span>
  )
}

export interface EmptyStateProps {
  title?: React.ReactNode
  /** One or two sentences. Say what goes here and what it is for. */
  body?: React.ReactNode
  /** A real control — Button, Input, Select. Not a sentence pointing elsewhere. */
  action?: React.ReactNode
  centered?: boolean
  className?: string
}

/**
 * A pane with nothing in it yet, and the next action attached.
 *
 * Never ship a bare "Nothing here".
 */
export function EmptyState({
  title,
  body,
  action,
  centered = false,
  className = ''
}: EmptyStateProps): React.JSX.Element {
  const classes = ['ic-empty', centered ? 'ic-empty--centered' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {title && <span className="ic-empty__title">{title}</span>}
      {body && <p className="ic-empty__body">{body}</p>}
      {action}
    </div>
  )
}

/** One line of guidance inside a pane that already has content. */
export function Hint({
  tone = 'default',
  tight = false,
  className = '',
  children
}: {
  tone?: 'default' | 'error'
  /**
   * No padding of its own, for a line that sits under or beside a control
   * rather than as a block in a pane — the same treatment `Field` gives its
   * own hint. A divergence: the kit has only the padded block, and reaches
   * for an inline `style={{ padding }}` when it needs this (`Diagnostics.jsx`).
   */
  tight?: boolean
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  // The two treatments spell error differently: the block has a modifier,
  // the field hint a state class, because Field toggles it on one element.
  const classes = tight
    ? ['ic-field__hint', tone === 'error' ? 'is-error' : '']
    : ['ic-hint', tone === 'error' ? 'ic-hint--error' : '']
  return (
    <p className={[...classes, className].filter(Boolean).join(' ')}>
      {children}
    </p>
  )
}
