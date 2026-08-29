import React from 'react'
import { Icon } from '../core/Icon'

const ICONS = { ok: 'check', error: 'circle-alert', info: 'info' }

/** A write that happened somewhere the author is not looking. */
export function Toast({ tone = 'info', title, detail, onDismiss, className = '' }) {
  return (
    <div className={['ic-toast', `ic-toast--${tone}`, className].filter(Boolean).join(' ')} role="status">
      <Icon name={ICONS[tone]} size={14} style={{ marginTop: 1, color: `var(--state-${tone === 'ok' ? 'ok' : tone === 'error' ? 'error' : 'info'})` }} />
      <div className="ic-toast__body">
        <div className="ic-toast__title">{title}</div>
        {detail && <div className="ic-toast__detail">{detail}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="ic-iconbtn ic-iconbtn--xs" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  )
}

/** Fixed stack, bottom-right, above the diagnostics strip. */
export function ToastStack({ children }) { return <div className="ic-toasts">{children}</div> }
