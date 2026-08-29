import * as React from 'react'

export interface PaneHeaderProps {
  title: React.ReactNode
  /** Icon buttons or quiet buttons scoped to this pane only. */
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export declare function PaneHeader(props: PaneHeaderProps): React.JSX.Element
export declare function GroupLabel(props: { children?: React.ReactNode; className?: string }): React.JSX.Element
