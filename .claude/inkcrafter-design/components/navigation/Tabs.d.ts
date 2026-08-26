import * as React from 'react'

export interface TabItem {
  value: string
  label: React.ReactNode
  icon?: string
  /** Rendered in parentheses after the label — asset counts, entry counts. */
  count?: number
  /** Tooltip; use it for the keyboard shortcut. */
  hint?: string
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  /** view = toolbar primary switch · pane = uppercase pane strip · sub = second row inside a pane */
  level?: 'view' | 'pane' | 'sub'
  /** Right-aligned actions that belong to the tab strip itself. */
  trail?: React.ReactNode
  label?: string
  className?: string
}

export declare function Tabs(props: TabsProps): React.JSX.Element
