import React from 'react'

/**
 * Label + control + hint. The only sanctioned way to name a control:
 * uppercase tracked label stacked above, or an inline 96px label column
 * inside dense detail panes.
 */
export function Field({ label, hint, error, inline = false, htmlFor, className = '', children }) {
  const classes = ['ic-field', inline ? 'ic-field--inline' : '', className].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      {label && <label className="ic-field__label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {(error || hint) && (
        <span className={`ic-field__hint${error ? ' is-error' : ''}`}>{error || hint}</span>
      )}
    </div>
  )
}
