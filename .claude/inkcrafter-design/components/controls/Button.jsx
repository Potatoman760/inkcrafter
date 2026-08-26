import React from 'react'
import { Icon } from '../core/Icon'

const SIZES = { xs: 'ic-btn--xs', sm: 'ic-btn--sm', md: '', lg: 'ic-btn--lg' }

/**
 * The one button. Variant carries the meaning, never the size or colour:
 * at most one `primary` per pane, `quiet` inside toolbars and pane
 * headers, `link` for a reversible inline action.
 */
export function Button({
  variant = 'default',
  size = 'md',
  icon,
  iconAfter,
  block = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'ic-btn',
    variant !== 'default' ? `ic-btn--${variant}` : '',
    SIZES[size] || '',
    block ? 'ic-btn--block' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <button type="button" className={classes} {...rest}>
      {icon && <Icon name={icon} size={size === 'lg' ? 15 : 13} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={13} />}
    </button>
  )
}
