import * as React from 'react'

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: string
  /** Required: used as both accessible name and tooltip. */
  label: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Toggled-on state, e.g. a dock panel that is showing. */
  active?: boolean
}

export declare function IconButton(props: IconButtonProps): React.JSX.Element
