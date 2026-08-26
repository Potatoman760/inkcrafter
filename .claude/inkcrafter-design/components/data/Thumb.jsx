import React from 'react'

const SIZES = { sm: 'ic-thumb--sm', md: 'ic-thumb--md', wide: 'ic-thumb--wide' }

/** Media asset preview. A checkerboard shows transparency honestly. */
export function Thumb({ src, alt = '', size = 'md', missing = false, label, className = '', ...rest }) {
  const classes = ['ic-thumb', SIZES[size] || '', missing ? 'is-missing' : '', className]
    .filter(Boolean).join(' ')
  return (
    <div className={classes} {...rest}>
      {src && !missing ? <img src={src} alt={alt} /> : <span>{missing ? 'missing' : label}</span>}
    </div>
  )
}

/** Stand-in for imagery the design does not have yet. Says what belongs there. */
export function Placeholder({ label, className = '', style }) {
  return <div className={['ic-placeholder', className].filter(Boolean).join(' ')} style={style}>{label}</div>
}
