import React from 'react'

/** Single-line text input. `mono` for paths, knots and identifiers. */
export function Input({ mono = false, invalid = false, size = 'md', className = '', ...rest }) {
  const classes = [
    'ic-input',
    mono ? 'ic-input--mono' : '',
    invalid ? 'ic-input--invalid' : '',
    size === 'sm' ? 'ic-input--sm' : '',
    className
  ].filter(Boolean).join(' ')
  return <input className={classes} aria-invalid={invalid || undefined} {...rest} />
}
