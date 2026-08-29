import React from 'react'

/** Multi-line input. `mono` for ink source, prose for summaries. */
export function Textarea({ mono = false, rows = 4, className = '', ...rest }) {
  const classes = ['ic-textarea', mono ? 'ic-textarea--mono' : '', className].filter(Boolean).join(' ')
  return <textarea className={classes} rows={rows} {...rest} />
}
