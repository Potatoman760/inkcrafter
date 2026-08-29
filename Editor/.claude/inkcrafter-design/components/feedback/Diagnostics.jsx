import React from 'react'

/** The compiler strip along the bottom of the window. */
export function Diagnostics({ items = [], onSelect, emptyLabel = 'No problems', className = '' }) {
  const classes = ['ic-diagnostics', items.length === 0 ? 'is-empty' : '', className]
    .filter(Boolean).join(' ')
  return (
    <footer className={classes} aria-label="Diagnostics">
      {items.length === 0 ? (
        <p className="ic-hint" style={{ padding: '4px 12px' }}>{emptyLabel}</p>
      ) : (
        items.map((item, index) => (
          <div
            key={index}
            className={`ic-diag ic-diag--${item.severity}`}
            onClick={() => onSelect?.(item)}
          >
            <span className="ic-diag__severity">{item.severity}</span>
            {item.line !== null && item.line !== undefined && (
              <span className="ic-diag__line">{item.file ? `${item.file}:` : 'line '}{item.line}</span>
            )}
            <span className="ic-diag__message">{item.message}</span>
          </div>
        ))
      )}
    </footer>
  )
}
