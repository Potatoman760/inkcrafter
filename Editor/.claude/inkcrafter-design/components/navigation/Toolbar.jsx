import React from 'react'

/**
 * The window toolbar: project identity, the view switch, the open
 * document, then status. It is the only place global commands may live,
 * and it is draggable window chrome everywhere else.
 */
export function Toolbar({ className = '', children, ...rest }) {
  return <header className={['ic-toolbar', className].filter(Boolean).join(' ')} {...rest}>{children}</header>
}

export function ToolbarBrand({ style, children }) {
  return <span className="ic-toolbar__brand" style={style}>{children}</span>
}
export function ToolbarSpacer() { return <span className="ic-toolbar__spacer" /> }
export function ToolbarRule() { return <span className="ic-toolbar__rule" /> }
export function ToolbarGroup({ children }) { return <span className="ic-toolbar__group">{children}</span> }
export function ToolbarFile({ children }) { return <span className="ic-toolbar__file">{children}</span> }
