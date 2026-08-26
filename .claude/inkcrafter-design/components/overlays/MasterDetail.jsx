import React from 'react'

/**
 * The layout every catalogue uses: a filterable list on the left, the
 * selected thing's fields on the right. Stats, items, media, cast,
 * providers and libraries are all this shape, which is why it is a
 * component and not a per-panel decision.
 */
export function MasterDetail({ master, detail, masterWidth = 240, className = '' }) {
  return (
    <div
      className={['ic-master-detail', className].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns: `${masterWidth}px 1fr` }}
    >
      <div className="ic-master-detail__master">{master}</div>
      <div className="ic-master-detail__detail">{detail}</div>
    </div>
  )
}

export function MasterList({ children }) { return <div className="ic-master-detail__list">{children}</div> }
