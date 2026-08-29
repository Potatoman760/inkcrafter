import * as React from 'react'

/**
 * @startingPoint section="Controls" subtitle="Buttons in every variant and size" viewport="700x150"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** default = neutral action · primary = the pane's one commit · danger = destructive · quiet = toolbar/pane-header · link = reversible inline action */
  variant?: 'default' | 'primary' | 'danger' | 'quiet' | 'link'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Lucide icon name shown before the label. */
  icon?: string
  iconAfter?: string
  block?: boolean
}

export declare function Button(props: ButtonProps): React.JSX.Element
