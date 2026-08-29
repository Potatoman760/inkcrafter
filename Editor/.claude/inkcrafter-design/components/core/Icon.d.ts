import * as React from 'react'

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lucide icon name in kebab-case, e.g. "file-text", "git-branch". */
  name: string
  /** Box size in px. 14 for controls, 16 for toolbars, 12 for chips. */
  size?: number
  strokeWidth?: 'regular' | 'thin'
}

export declare function Icon(props: IconProps): React.JSX.Element
