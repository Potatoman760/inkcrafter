import React from 'react'

/** Checkbox with its label as one hit target. */
export function Checkbox({ label, disabled = false, className = '', ...rest }) {
  const classes = ['ic-check', disabled ? 'is-disabled' : '', className].filter(Boolean).join(' ')
  return (
    <label className={classes}>
      <input type="checkbox" disabled={disabled} {...rest} />
      <span>{label}</span>
    </label>
  )
}
