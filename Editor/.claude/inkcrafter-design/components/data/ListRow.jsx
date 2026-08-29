import React from 'react'
import { Icon } from '../core/Icon'

/**
 * The workhorse row: files, codex entries, stats, items, media, models,
 * providers. Selection shows as a surface change plus a 2px left marker,
 * so it survives colour-blindness and a light theme both.
 */
export function ListRow({
  name,
  meta,
  icon,
  selected = false,
  dirty = false,
  mono = false,
  trail,
  as: Tag = 'button',
  className = '',
  ...rest
}) {
  const classes = ['ic-row', selected ? 'is-selected' : '', dirty ? 'ic-row--dirty' : '', className]
    .filter(Boolean).join(' ')
  const extra = Tag === 'button' ? { type: 'button' } : {}
  return (
    <Tag className={classes} aria-current={selected || undefined} {...extra} {...rest}>
      {icon && <span className="ic-row__icon"><Icon name={icon} size={13} /></span>}
      <span className="ic-row__body">
        <span className={`ic-row__name${mono ? ' ic-row__name--mono' : ''}`}>{name}</span>
        {meta && <span className="ic-row__meta">{meta}</span>}
      </span>
      {trail && <span className="ic-row__trail">{trail}</span>}
    </Tag>
  )
}
