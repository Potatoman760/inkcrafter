import * as React from 'react'

export interface MeterProps {
  value: number
  min?: number
  max?: number
  tone?: 'branch' | 'signal' | 'caution' | 'alert'
  className?: string
}

export declare function Meter(props: MeterProps): React.JSX.Element
