import * as React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** accent = entry point / active · branch = choices, diverts · warn = needs attention · zero = an empty count */
  variant?: 'default' | 'accent' | 'branch' | 'warn' | 'zero'
}

export declare function Badge(props: BadgeProps): React.JSX.Element
