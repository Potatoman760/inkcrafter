import React from 'react'
import { Icon } from '../core/Icon'

/**
 * View switch. `level` decides the treatment: "view" for the toolbar's
 * primary switch, "pane" for a pane's uppercase strip, "sub" for a
 * second row inside a pane.
 */
export function Tabs({ items, value, onChange, level = 'view', trail, label, className = '' }) {
  const classes = [
    'ic-tabs',
    level === 'pane' ? 'ic-tabs--pane' : '',
    level === 'sub' ? 'ic-tabs--sub' : '',
    className
  ].filter(Boolean).join(' ')
  return (
    <nav className={classes} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={`ic-tab${item.value === value ? ' is-active' : ''}`}
          title={item.hint}
          onClick={() => onChange(item.value)}
        >
          {item.icon && <Icon name={item.icon} size={13} />}
          {item.label}
          {item.count !== undefined && <span style={{ color: 'var(--text-faint)' }}>({item.count})</span>}
        </button>
      ))}
      {trail && <span className="ic-tabs__trail">{trail}</span>}
    </nav>
  )
}
