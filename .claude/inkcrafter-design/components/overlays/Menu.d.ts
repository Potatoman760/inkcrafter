import * as React from 'react'

export interface MenuProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Mono uppercase context line — where the click landed, e.g. "in knot the_cove". */
  label?: React.ReactNode
}

export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: string
  /** Shortcut, right-aligned in mono. */
  keys?: string
  danger?: boolean
}

export declare function Menu(props: MenuProps): React.JSX.Element
export declare function MenuItem(props: MenuItemProps): React.JSX.Element
export declare function MenuSeparator(): React.JSX.Element
export declare function Popover(props: { style?: React.CSSProperties; className?: string; children?: React.ReactNode }): React.JSX.Element
