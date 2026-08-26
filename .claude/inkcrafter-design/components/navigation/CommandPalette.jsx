import React, { useMemo, useState } from 'react'
import { Icon } from '../core/Icon'

/**
 * Ctrl/Cmd+K. Every command in the app is reachable here, which is the
 * reason the toolbars are allowed to stay short. Sections mirror the
 * menus, so learning one teaches the other.
 */
export function CommandPalette({ commands, onRun, onClose, placeholder = 'Search commands, files, knots…' }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    return commands.filter((command) =>
      terms.every((term) =>
        `${command.section} ${command.label}`.toLowerCase().includes(term)
      )
    )
  }, [commands, query])

  const sections = matches.reduce((groups, command) => {
    (groups[command.section] ||= []).push(command)
    return groups
  }, {})

  return (
    <div className="ic-scrim" style={{ alignItems: 'flex-start', paddingTop: '12vh' }} onMouseDown={onClose}>
      <div className="ic-palette" role="dialog" aria-label="Commands" onMouseDown={(event) => event.stopPropagation()}>
        <input
          autoFocus
          className="ic-palette__input"
          placeholder={placeholder}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setIndex(0) }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((i) => Math.min(i + 1, matches.length - 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
            if (event.key === 'Enter' && matches[index]) onRun(matches[index])
            if (event.key === 'Escape') onClose?.()
          }}
        />
        <div className="ic-palette__list">
          {matches.length === 0 && <p className="ic-hint">Nothing matches “{query}”.</p>}
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              <div className="ic-palette__section">{section}</div>
              {items.map((command) => {
                const position = matches.indexOf(command)
                return (
                  <button
                    key={command.id}
                    type="button"
                    className={`ic-palette__item${position === index ? ' is-highlighted' : ''}`}
                    onMouseEnter={() => setIndex(position)}
                    onClick={() => onRun(command)}
                  >
                    {command.icon && <Icon name={command.icon} size={14} />}
                    {command.label}
                    {command.keys && <Kbd>{command.keys}</Kbd>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Kbd({ children }) { return <kbd className="ic-kbd">{children}</kbd> }
