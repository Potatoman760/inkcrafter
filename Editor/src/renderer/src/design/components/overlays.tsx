import { useEffect, useRef } from 'react'
import { Icon, type IconName } from '../Icon'

/** Everything that floats: dialogs, menus, popovers. */

export interface DialogProps {
  title: React.ReactNode
  /**
   * The accessible name, when the title carries more than words — an unsaved
   * dot, a count. A string title names the dialog by itself.
   */
  ariaLabel?: string
  /** Monospace context line — a path, a file name. */
  subtitle?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  onClose?: () => void
  /** Destructive far left, then a DialogSpacer, then cancel and the primary. */
  footer?: React.ReactNode
  /** Remove the body padding, for a dialog that holds its own layout. */
  flush?: boolean
  /**
   * False while the dialog is doing something it should not be interrupted
   * during — an export mid-write. Escape and the scrim both stop working, and
   * the close button goes disabled rather than disappearing.
   */
  closable?: boolean
  /**
   * A width/height override for a dialog whose content sets its own size —
   * `.entry-dialog` is the app's. Prefer `size` where one of the three fits.
   */
  className?: string
  children?: React.ReactNode
}

const MIN_DIALOG_WIDTH = 320
const MIN_DIALOG_HEIGHT = 180
const KEYBOARD_RESIZE_STEP = 16

function numeric(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function currentSize(target: HTMLElement): { width: number; height: number } {
  const rect = target.getBoundingClientRect()
  return {
    width: rect.width || target.offsetWidth || MIN_DIALOG_WIDTH,
    height: rect.height || target.offsetHeight || MIN_DIALOG_HEIGHT
  }
}

function resizeTo(target: HTMLElement, wantedWidth: number, wantedHeight: number): void {
  const container = target.parentElement
  const style = container ? window.getComputedStyle(container) : null
  const containerWidth = container?.clientWidth || window.innerWidth
  const containerHeight = container?.clientHeight || window.innerHeight
  const maxWidth = Math.max(
    1,
    containerWidth - numeric(style?.paddingLeft ?? '') - numeric(style?.paddingRight ?? '')
  )
  const maxHeight = Math.max(
    1,
    containerHeight - numeric(style?.paddingTop ?? '') - numeric(style?.paddingBottom ?? '')
  )
  const minWidth = Math.min(MIN_DIALOG_WIDTH, maxWidth)
  const minHeight = Math.min(MIN_DIALOG_HEIGHT, maxHeight)

  target.style.width = `${Math.round(Math.min(maxWidth, Math.max(minWidth, wantedWidth)))}px`
  target.style.height = `${Math.round(Math.min(maxHeight, Math.max(minHeight, wantedHeight)))}px`
}

/** Shared mouse and keyboard resize grip for every modal surface. */
export function DialogResizeHandle({
  targetRef
}: {
  targetRef: React.RefObject<HTMLElement | null>
}): React.JSX.Element {
  const stopDragging = useRef<(() => void) | null>(null)

  useEffect(() => () => stopDragging.current?.(), [])

  return (
    <button
      type="button"
      className="ic-dialog__resize"
      aria-label="Resize dialog"
      title="Drag to resize. Arrow keys resize when focused."
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const target = targetRef.current
        if (!target) return

        event.preventDefault()
        event.stopPropagation()
        stopDragging.current?.()

        const start = currentSize(target)
        const startX = event.clientX
        const startY = event.clientY
        const move = (next: PointerEvent): void => {
          resizeTo(target, start.width + next.clientX - startX, start.height + next.clientY - startY)
        }
        const stop = (): void => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', stop)
          window.removeEventListener('pointercancel', stop)
          stopDragging.current = null
        }

        stopDragging.current = stop
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', stop)
        window.addEventListener('pointercancel', stop)
      }}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        const target = targetRef.current
        if (!target) return

        event.preventDefault()
        event.stopPropagation()
        const size = currentSize(target)
        const step = event.shiftKey ? KEYBOARD_RESIZE_STEP * 4 : KEYBOARD_RESIZE_STEP
        const width = size.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)
        const height = size.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)
        resizeTo(target, width, height)
      }}
    />
  )
}

/**
 * A modal shell with a scrim, Escape, and a footer action bar.
 *
 * Configuration and one-off actions only — settings, project setup, libraries,
 * entry editing, export. Anything the author does *while writing* belongs in a
 * pane. Never stack a dialog on a dialog; swap them, as project → libraries
 * already does.
 */
export function Dialog({
  title,
  ariaLabel,
  subtitle,
  size = 'md',
  onClose,
  footer,
  flush = false,
  closable = true,
  className = '',
  children
}: DialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!closable) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // The window listens for Escape too. A dialog that closes on it has to
      // stop it there, or the keypress that shuts this also shuts whatever is
      // behind it.
      event.stopPropagation()
      onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, closable])

  return (
    <div className="ic-scrim" onMouseDown={closable ? onClose : undefined}>
      <div
        ref={dialogRef}
        className={['ic-dialog', size !== 'md' ? `ic-dialog--${size}` : '', className]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        // mousedown rather than click: a drag that starts inside the dialog and
        // releases on the scrim should not close it.
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ic-dialog__header">
          <h2 className="ic-dialog__title">{title}</h2>
          {subtitle && <span className="ic-dialog__subtitle">{subtitle}</span>}
          <button
            type="button"
            className="ic-iconbtn"
            aria-label="Close"
            disabled={!closable}
            onClick={onClose}
          >
            <Icon name="x" size={14} />
          </button>
        </header>
        <div className={`ic-dialog__body${flush ? ' ic-dialog__body--flush' : ''}`}>{children}</div>
        {footer && <footer className="ic-dialog__footer">{footer}</footer>}
        <DialogResizeHandle targetRef={dialogRef} />
      </div>
    </div>
  )
}

/** Pushes what follows it to the right of a dialog footer. */
export function DialogSpacer(): React.JSX.Element {
  return <span className="ic-spacer" />
}

/**
 * Right-click and dropdown menus, including the ink context menu.
 *
 * Group by what the item edits, separators between the groups, destructive
 * last and alone.
 */
export function Menu({
  label,
  labelClassName = '',
  style,
  className = '',
  children,
  ...rest
}: React.ComponentPropsWithRef<'div'> & {
  label?: React.ReactNode
  /** For a label that carries more than a word — what the menu is acting on. */
  labelClassName?: string
}): React.JSX.Element {
  return (
    <div
      className={['ic-menu', className].filter(Boolean).join(' ')}
      role="menu"
      style={style}
      {...rest}
    >
      {label && (
        <div className={['ic-menu__label', labelClassName].filter(Boolean).join(' ')}>{label}</div>
      )}
      {children}
    </div>
  )
}

export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName
  /** Shortcut, right-aligned in mono. */
  keys?: string
  danger?: boolean
}

export function MenuItem({
  icon,
  keys,
  danger = false,
  className = '',
  children,
  type = 'button',
  ...rest
}: MenuItemProps): React.JSX.Element {
  return (
    <button
      type={type}
      role="menuitem"
      className={['ic-menu__item', danger ? 'ic-menu__item--danger' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
      {keys && <code>{keys}</code>}
    </button>
  )
}

export function MenuSeparator(): React.JSX.Element {
  return <div className="ic-menu__sep" role="separator" />
}

/** An anchored panel: model pickers, filters, quick edits. Not a menu. */
export function Popover({
  style,
  className = '',
  children
}: {
  style?: React.CSSProperties
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={['ic-popover', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  )
}
