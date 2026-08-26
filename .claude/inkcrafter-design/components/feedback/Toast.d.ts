import * as React from 'react'

export interface ToastProps {
  tone?: 'ok' | 'error' | 'info'
  title: React.ReactNode
  /** File paths written, counts — the evidence. */
  detail?: React.ReactNode
  onDismiss?: () => void
  className?: string
}

export declare function Toast(props: ToastProps): React.JSX.Element
export declare function ToastStack(props: { children?: React.ReactNode }): React.JSX.Element
