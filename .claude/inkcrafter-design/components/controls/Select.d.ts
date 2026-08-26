import * as React from 'react'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  size?: 'sm' | 'md'
}

export declare function Select(props: SelectProps): React.JSX.Element
