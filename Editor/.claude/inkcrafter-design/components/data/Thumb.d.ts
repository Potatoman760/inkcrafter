import * as React from 'react'

export interface ThumbProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  size?: 'sm' | 'md' | 'wide'
  /** File is referenced but absent from media/ — dashed red. */
  missing?: boolean
  /** Shown when there is no image: a kind, an extension, a count. */
  label?: string
}

export declare function Thumb(props: ThumbProps): React.JSX.Element
export declare function Placeholder(props: { label: string; className?: string; style?: React.CSSProperties }): React.JSX.Element
