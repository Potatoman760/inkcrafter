import * as React from 'react'

export interface Diagnostic {
  severity: 'error' | 'warning' | 'todo'
  message: string
  line?: number | null
  /** Path shown before the line number when the problem is in another file. */
  file?: string
}

/**
 * @startingPoint section="Feedback" subtitle="Compiler diagnostics strip" viewport="700x160"
 */
export interface DiagnosticsProps {
  items?: Diagnostic[]
  onSelect?: (item: Diagnostic) => void
  emptyLabel?: string
  className?: string
}

export declare function Diagnostics(props: DiagnosticsProps): React.JSX.Element
