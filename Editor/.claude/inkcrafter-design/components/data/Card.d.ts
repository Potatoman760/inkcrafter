import * as React from 'react'

/**
 * @startingPoint section="Data" subtitle="Plan card with status stripe" viewport="700x220"
 */
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Plan status; drives the top stripe colour. */
  status?: 'planned' | 'drafting' | 'done'
  selected?: boolean
  interactive?: boolean
}

export declare function Card(props: CardProps): React.JSX.Element
export declare function CardHead(props: { children?: React.ReactNode }): React.JSX.Element
export declare function CardTitle(props: { children?: React.ReactNode }): React.JSX.Element
export declare function CardSummary(props: { empty?: boolean; children?: React.ReactNode; onClick?: React.MouseEventHandler }): React.JSX.Element
export declare function CardFoot(props: { children?: React.ReactNode }): React.JSX.Element
