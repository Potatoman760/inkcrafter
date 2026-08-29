import React from 'react'

/** A pane's name and its own actions. Nothing global belongs here. */
export function PaneHeader({ title, actions, className = '', children }) {
  return (
    <div className={['ic-pane-header', className].filter(Boolean).join(' ')}>
      <span className="ic-pane-header__title">{title}</span>
      {children}
      {actions && <span className="ic-pane-header__actions">{actions}</span>}
    </div>
  )
}

/** Uppercase mono label inside a scrolling list. */
export function GroupLabel({ children, className = '' }) {
  return <div className={['ic-group-label', className].filter(Boolean).join(' ')}>{children}</div>
}
