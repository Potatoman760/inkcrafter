import { Icon, type IconName } from '../Icon'

const GLYPH: Record<ToastTone, IconName> = {
  ok: 'check',
  error: 'circle-alert',
  info: 'info'
}

const COLOUR: Record<ToastTone, string> = {
  ok: 'var(--state-ok)',
  error: 'var(--state-error)',
  info: 'var(--state-info)'
}

export type ToastTone = 'ok' | 'error' | 'info'

export interface ToastProps {
  tone?: ToastTone
  title: React.ReactNode
  /** The evidence: file paths written, counts. */
  detail?: React.ReactNode
  onDismiss?: () => void
  className?: string
}

/**
 * A write that happened somewhere the author was not looking.
 *
 * Confirms only what is invisible — assistant edits, a generated
 * `ink/state.ink`, an export. Never toast something already on screen; that is
 * noise pretending to be accountability.
 */
export function Toast({
  tone = 'info',
  title,
  detail,
  onDismiss,
  className = ''
}: ToastProps): React.JSX.Element {
  return (
    <div
      className={['ic-toast', `ic-toast--${tone}`, className].filter(Boolean).join(' ')}
      role="status"
    >
      <Icon name={GLYPH[tone]} size={14} style={{ marginTop: 1, color: COLOUR[tone] }} />
      <div className="ic-toast__body">
        <div className="ic-toast__title">{title}</div>
        {detail && <div className="ic-toast__detail">{detail}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="ic-iconbtn ic-iconbtn--xs"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  )
}

/**
 * The stack, which is `position: absolute` and must be mounted **inside the
 * content pane it reports on** — that pane needs `position: relative`.
 *
 * Not at the window root. The window's bottom-right corner belongs to the
 * dock's composer and the diagnostics strip, and a window-anchored stack covers
 * one or the other at every size. A toast must never sit on top of a compile
 * error or the Send button.
 *
 * (Upstream's jsdoc calls this a fixed stack. Its own CSS is `absolute` and its
 * prompt spells out the in-pane rule at length; the prompt is the considered
 * version and this follows it.)
 */
export function ToastStack({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="ic-toasts" aria-live="polite">
      {children}
    </div>
  )
}
