import React from 'react'

/**
 * A pane with nothing in it yet. Every one names the next action, and
 * the action is a real control, not a sentence telling you to go
 * elsewhere.
 */
export function EmptyState({ title, body, action, centered = false, className = '' }) {
  const classes = ['ic-empty', centered ? 'ic-empty--centered' : '', className]
    .filter(Boolean).join(' ')
  return (
    <div className={classes}>
      {title && <span className="ic-empty__title">{title}</span>}
      {body && <p className="ic-empty__body">{body}</p>}
      {action}
    </div>
  )
}

/** One line of guidance inside a populated pane. */
export function Hint({ tone = 'default', className = '', children }) {
  return (
    <p className={['ic-hint', tone === 'error' ? 'ic-hint--error' : '', className].filter(Boolean).join(' ')}>
      {children}
    </p>
  )
}
