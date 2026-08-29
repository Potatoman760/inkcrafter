import * as React from 'react'

/**
 * @startingPoint section="Overlays" subtitle="Modal dialog shell" viewport="700x420"
 */
export interface DialogProps {
  title: React.ReactNode
  /** Monospace context line — a path, a file name. */
  subtitle?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  onClose?: () => void
  /** Footer actions: destructive left, DialogSpacer, then cancel + primary. */
  footer?: React.ReactNode
  /** Remove body padding, for master–detail dialogs. */
  flush?: boolean
  children?: React.ReactNode
}

export declare function Dialog(props: DialogProps): React.JSX.Element
export declare function DialogSpacer(): React.JSX.Element
