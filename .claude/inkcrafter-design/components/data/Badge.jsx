import React from 'react'

/** A count or one-word state on a row. Never clickable. */
export function Badge({ variant = 'default', className = '', children, ...rest }) {
  const classes = ['ic-badge', variant !== 'default' ? `ic-badge--${variant}` : '', className]
    .filter(Boolean).join(' ')
  return <span className={classes} {...rest}>{children}</span>
}
