import * as React from 'react'

export interface ChipProps {
  /** detected = inferred by the app, not typed by the author (dashed) · accent = linked/active */
  variant?: 'default' | 'detected' | 'accent'
  mono?: boolean
  onRemove?: React.MouseEventHandler
  onClick?: React.MouseEventHandler
  className?: string
  children?: React.ReactNode
}

export declare function Chip(props: ChipProps): React.JSX.Element
export declare function ChipRow(props: { className?: string; children?: React.ReactNode }): React.JSX.Element
