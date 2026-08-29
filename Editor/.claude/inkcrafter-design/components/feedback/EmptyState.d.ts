import * as React from 'react'

export interface EmptyStateProps {
  title?: React.ReactNode
  /** One or two sentences. Say what goes here and what it is for. */
  body?: React.ReactNode
  /** A real control — Button, Input, Select. */
  action?: React.ReactNode
  centered?: boolean
  className?: string
}

export declare function EmptyState(props: EmptyStateProps): React.JSX.Element
export declare function Hint(props: { tone?: 'default' | 'error'; className?: string; children?: React.ReactNode }): React.JSX.Element
