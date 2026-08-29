import * as React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Monospace: file paths, knot names, ink identifiers, model ids. */
  mono?: boolean
  invalid?: boolean
  size?: 'sm' | 'md'
}

export declare function Input(props: InputProps): React.JSX.Element
