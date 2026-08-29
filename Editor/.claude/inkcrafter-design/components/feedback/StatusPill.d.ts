import * as React from 'react'

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** ok = compiled · error = compile failed · warn = compiled with warnings · busy = compiling/saving (dot pulses) */
  state?: 'idle' | 'ok' | 'error' | 'warn' | 'busy'
}

export declare function StatusPill(props: StatusPillProps): React.JSX.Element
