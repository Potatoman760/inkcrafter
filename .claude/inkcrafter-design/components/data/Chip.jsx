import React from 'react'
import { Icon } from '../core/Icon'

/** A tag, cast member or attached file. Lives inside `.ic-chips`. */
export function Chip({ variant = 'default', mono = false, onRemove, onClick, className = '', children }) {
  const classes = [
    'ic-chip',
    variant !== 'default' ? `ic-chip--${variant}` : '',
    mono ? 'ic-chip--mono' : '',
    className
  ].filter(Boolean).join(' ')
  return (
    <li className={classes}>
      {onClick ? <button type="button" onClick={onClick}>{children}</button> : <span>{children}</span>}
      {onRemove && (
        <button type="button" className="ic-chip__x" aria-label="Remove" onClick={onRemove}>
          <Icon name="x" size={10} />
        </button>
      )}
    </li>
  )
}

/** The wrapping row chips must sit in. */
export function ChipRow({ className = '', children }) {
  return <ul className={['ic-chips', className].filter(Boolean).join(' ')}>{children}</ul>
}
