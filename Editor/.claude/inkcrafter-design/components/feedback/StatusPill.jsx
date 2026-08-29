import React from 'react'

/**
 * Compile and save state, at the right end of the toolbar. One pill per
 * window — status that appears in two places is status nobody trusts.
 */
export function StatusPill({ state = 'idle', className = '', children, ...rest }) {
  const classes = ['ic-pill', state !== 'idle' ? `ic-pill--${state}` : '', className]
    .filter(Boolean).join(' ')
  return (
    <span className={classes} role="status" {...rest}>
      <span className="ic-pill__dot" />
      {children}
    </span>
  )
}
