import * as React from 'react'

export interface Command {
  id: string
  /** Mirrors a menu name: File, Project, View, Story, Assistant. */
  section: string
  label: string
  icon?: string
  /** Shortcut display, e.g. "Ctrl+1". */
  keys?: string
}

/**
 * @startingPoint section="Navigation" subtitle="Ctrl+K command palette" viewport="700x400"
 */
export interface CommandPaletteProps {
  commands: Command[]
  onRun: (command: Command) => void
  onClose?: () => void
  placeholder?: string
}

export declare function CommandPalette(props: CommandPaletteProps): React.JSX.Element
export declare function Kbd(props: { children?: React.ReactNode }): React.JSX.Element
