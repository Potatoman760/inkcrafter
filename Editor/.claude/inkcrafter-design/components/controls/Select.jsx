import React from 'react'

/** Native select in the system's shell. Options stay native for keyboard and platform behaviour. */
export function Select({ size = 'md', className = '', children, ...rest }) {
  const classes = ['ic-select', size === 'sm' ? 'ic-select--sm' : '', className].filter(Boolean).join(' ')
  return <select className={classes} {...rest}>{children}</select>
}
