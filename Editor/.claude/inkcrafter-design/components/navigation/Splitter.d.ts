import * as React from 'react'

export interface SplitterProps {
  /** Width in px of the pane this splitter sizes. */
  value: number
  onChange: (value: number) => void
  /** Fired once at the end of a drag, for persistence. */
  onCommit?: (value: number) => void
  min: number
  max: number
  /** True for a right-hand pane, where dragging right shrinks it. */
  invert?: boolean
  /** Width restored on double-click or Home. */
  reset: number
  label: string
}

export declare function Splitter(props: SplitterProps): React.JSX.Element
