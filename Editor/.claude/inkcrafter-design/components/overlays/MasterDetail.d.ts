import * as React from 'react'

/**
 * @startingPoint section="Overlays" subtitle="Catalogue master–detail layout" viewport="700x320"
 */
export interface MasterDetailProps {
  /** Filter + new + MasterList of ListRows. */
  master: React.ReactNode
  /** Fields for the selection, or an EmptyState when nothing is picked. */
  detail: React.ReactNode
  masterWidth?: number
  className?: string
}

export declare function MasterDetail(props: MasterDetailProps): React.JSX.Element
export declare function MasterList(props: { children?: React.ReactNode }): React.JSX.Element
