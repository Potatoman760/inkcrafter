import React, { useEffect } from 'react'
import { Icon } from '../core/Icon'

/**
 * Configuration and one-off actions only — settings, project setup,
 * libraries, entry editing, export. Anything the author does while
 * writing belongs in a pane, not in here.
 */
export function Dialog({ title, subtitle, size = 'md', onClose, footer, flush = false, children }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="ic-scrim" onMouseDown={onClose}>
      <div
        className={`ic-dialog${size !== 'md' ? ` ic-dialog--${size}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ic-dialog__header">
          <h2 className="ic-dialog__title">{title}</h2>
          {subtitle && <span className="ic-dialog__subtitle">{subtitle}</span>}
          <button type="button" className="ic-iconbtn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </header>
        <div className={`ic-dialog__body${flush ? ' ic-dialog__body--flush' : ''}`}>{children}</div>
        {footer && <footer className="ic-dialog__footer">{footer}</footer>}
      </div>
    </div>
  )
}

export function DialogSpacer() { return <span className="ic-spacer" /> }
