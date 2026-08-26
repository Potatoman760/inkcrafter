import * as React from 'react'

/**
 * @startingPoint section="Data" subtitle="Selectable list rows with badges" viewport="700x150"
 */
export interface ListRowProps {
  name: React.ReactNode
  /** Second line: a path, a tag list, a count phrase. */
  meta?: React.ReactNode
  /** Lucide name. Use one consistently per list, or none at all. */
  icon?: string
  selected?: boolean
  /** Unsaved marker — an amber dot after the name. */
  dirty?: boolean
  mono?: boolean
  /** Right-aligned badges or icon buttons. */
  trail?: React.ReactNode
  as?: 'button' | 'div' | 'li'
  className?: string
  onClick?: React.MouseEventHandler
  onDoubleClick?: React.MouseEventHandler
  title?: string
}

export declare function ListRow(props: ListRowProps): React.JSX.Element
