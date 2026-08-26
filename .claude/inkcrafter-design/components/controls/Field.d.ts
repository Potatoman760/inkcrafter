import * as React from 'react'

export interface FieldProps {
  label?: React.ReactNode
  /** One line, sentence case, explains consequence — not the label again. */
  hint?: React.ReactNode
  /** Replaces the hint and turns it red. */
  error?: React.ReactNode
  /** Inline puts the label in a fixed 96px column; for dense detail panes. */
  inline?: boolean
  htmlFor?: string
  className?: string
  children?: React.ReactNode
}

export declare function Field(props: FieldProps): React.JSX.Element
