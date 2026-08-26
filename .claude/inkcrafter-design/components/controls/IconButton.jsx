import React from 'react'
import { Icon } from '../core/Icon'

const SIZES = { xs: 'ic-iconbtn--xs', sm: 'ic-iconbtn--sm', md: '', lg: 'ic-iconbtn--lg' }

/** A square icon-only control. Always needs a label — it is the tooltip. */
export function IconButton({ icon, label, size = 'md', active = false, className = '', ...rest }) {
  const classes = ['ic-iconbtn', SIZES[size] || '', active ? 'is-active' : '', className]
    .filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} aria-label={label} title={label} aria-pressed={active || undefined} {...rest}>
      <Icon name={icon} size={size === 'lg' ? 16 : size === 'xs' ? 12 : 14} />
    </button>
  )
}
