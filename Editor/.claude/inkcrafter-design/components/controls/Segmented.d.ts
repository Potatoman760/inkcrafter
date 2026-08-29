import * as React from 'react'

export interface SegmentedOption {
  value: string
  label: React.ReactNode
}

export interface SegmentedProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export declare function Segmented(props: SegmentedProps): React.JSX.Element
