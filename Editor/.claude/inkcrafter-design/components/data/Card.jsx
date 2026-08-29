import React from 'react'

/**
 * A plan chapter, codex summary or picker item. Status shows as a 2px
 * stripe on the top edge so a board can be read at a glance.
 */
export function Card({ status, selected = false, interactive = false, className = '', children, ...rest }) {
  const classes = [
    'ic-card',
    status ? `ic-card--${status}` : '',
    selected ? 'is-selected' : '',
    interactive ? 'ic-card--interactive' : '',
    className
  ].filter(Boolean).join(' ')
  return (
    <article className={classes} {...rest}>
      {status && <span className="ic-card__stripe" />}
      {children}
    </article>
  )
}

export function CardHead({ children }) { return <header className="ic-card__head">{children}</header> }
export function CardTitle({ children }) { return <h3 className="ic-card__title">{children}</h3> }
export function CardSummary({ empty = false, children, ...rest }) {
  return <p className={`ic-card__summary${empty ? ' is-empty' : ''}`} {...rest}>{children}</p>
}
export function CardFoot({ children }) { return <footer className="ic-card__foot">{children}</footer> }
