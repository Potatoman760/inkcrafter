import React from 'react'
import { Icon } from '../core/Icon'

/** Right-click and dropdown menus, including the ink context menu. */
export function Menu({ label, style, className = '', children, ...rest }) {
  return (
    <div className={['ic-menu', className].filter(Boolean).join(' ')} role="menu" style={style} {...rest}>
      {label && <div className="ic-menu__label">{label}</div>}
      {children}
    </div>
  )
}

export function MenuItem({ icon, keys, danger = false, disabled = false, children, ...rest }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`ic-menu__item${danger ? ' ic-menu__item--danger' : ''}`}
      disabled={disabled}
      {...rest}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
      {keys && <code>{keys}</code>}
    </button>
  )
}

export function MenuSeparator() { return <div className="ic-menu__sep" role="separator" /> }

/** An anchored panel: model pickers, filters, quick edits. */
export function Popover({ style, className = '', children }) {
  return <div className={['ic-popover', className].filter(Boolean).join(' ')} style={style}>{children}</div>
}
