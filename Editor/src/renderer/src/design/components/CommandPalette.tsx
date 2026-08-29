import { useMemo, useRef, useState } from 'react'
import { APP_COMMANDS, displayKeys, type AppCommand } from '@shared/commands'
import { Icon, type IconName } from '../Icon'
import { DialogResizeHandle } from './overlays'

export function Kbd({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return <kbd className="ic-kbd">{children}</kbd>
}

export interface CommandPaletteProps {
  onRun: (command: AppCommand) => void
  onClose: () => void
  /** Defaults to every command in the app. */
  commands?: readonly AppCommand[]
  platform?: string
}

/**
 * Ctrl/Cmd+K, and every command in the app.
 *
 * This is what earns the toolbars the right to stay short: a command that is
 * hard to find in a menu is one keystroke away here, so nothing has to be
 * promoted to a button to be reachable. Sections mirror the menu bar, so
 * learning one teaches the other.
 *
 * The placeholder says "Search commands" rather than upstream's "Search
 * commands, files, knots…" — the palette does not search files or knots yet,
 * and a placeholder that promises what a control cannot do is a small lie the
 * author only discovers by trying.
 */
export function CommandPalette({
  onRun,
  onClose,
  commands = APP_COMMANDS,
  platform = 'win32'
}: CommandPaletteProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const paletteRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    return commands.filter((command) =>
      terms.every((term) => `${command.section} ${command.label}`.toLowerCase().includes(term))
    )
  }, [commands, query])

  const sections = matches.reduce<Record<string, AppCommand[]>>((groups, command) => {
    ;(groups[command.section] ||= []).push(command)
    return groups
  }, {})

  return (
    <div
      className="ic-scrim"
      style={{ alignItems: 'flex-start', paddingTop: '12vh' }}
      onMouseDown={onClose}
    >
      <div
        ref={paletteRef}
        className="ic-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Commands"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          className="ic-palette__input"
          aria-label="Search commands"
          placeholder="Search commands…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIndex((at) => Math.min(at + 1, matches.length - 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setIndex((at) => Math.max(at - 1, 0))
            }
            if (event.key === 'Enter') {
              const command = matches[index]
              if (command) onRun(command)
            }
            if (event.key === 'Escape') onClose()
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
                    key={command.action}
                    type="button"
                    className={`ic-palette__item${position === index ? ' is-highlighted' : ''}`}
                    onMouseEnter={() => setIndex(position)}
                    onClick={() => onRun(command)}
                  >
                    {command.icon && <Icon name={command.icon as IconName} size={14} />}
                    {command.label}
                    {command.accelerator && (
                      <Kbd>{displayKeys(command.accelerator, platform)}</Kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <DialogResizeHandle targetRef={paletteRef} />
      </div>
    </div>
  )
}
