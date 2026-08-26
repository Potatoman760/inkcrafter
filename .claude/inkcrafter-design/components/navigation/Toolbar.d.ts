import * as React from 'react'

/**
 * @startingPoint section="Navigation" subtitle="Window toolbar with view tabs and status" viewport="700x120"
 */
export interface ToolbarProps extends React.HTMLAttributes<HTMLElement> {}

export declare function Toolbar(props: ToolbarProps): React.JSX.Element
export declare function ToolbarBrand(props: { style?: React.CSSProperties; children?: React.ReactNode }): React.JSX.Element
export declare function ToolbarSpacer(): React.JSX.Element
export declare function ToolbarRule(): React.JSX.Element
export declare function ToolbarGroup(props: { children?: React.ReactNode }): React.JSX.Element
export declare function ToolbarFile(props: { children?: React.ReactNode }): React.JSX.Element
