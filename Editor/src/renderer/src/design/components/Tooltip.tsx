import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../Icon'

/**
 * An explanation, out of the way until it is wanted.
 *
 * The clause beside a label used to be printed there — "Model · Defaults to the
 * provider's." — which put the explanation where the eye already was, and also
 * put it there for the thousandth time, on every field, forever. A panel of
 * eight controls read as sixteen things instead of eight. This moves the
 * sentence behind a mark the eye can skip, and leaves the label a label.
 *
 * Only for writing that *teaches*. A note showing something the app worked out —
 * a filename, a pixel size, the variable a name will produce — stays printed
 * beside its label, because a value you have to hover to see is a value you
 * cannot check at a glance.
 *
 * Fixed rather than absolute, and positioned when it opens: the panels this
 * lives in scroll, and an absolutely placed bubble would be clipped at the first
 * pane edge it met.
 *
 * A focusable span rather than a button, which is the one thing here that looks
 * wrong and is not. `Field` renders a `<label>` around its control, and `button`
 * is a *labelable* element — so a button inside that label makes the label name
 * the mark instead of the input. Measured, not guessed: with a button the input
 * had no label at all, which would have taken the accessible name off every
 * field carrying one and broken the ~80 test queries that find controls by it.
 * A span is not labelable, so the association stays where it belongs.
 */

/** Roughly forty characters a line at the tooltip's size. */
const WIDTH = 240

/** Clear of the window edge, so the bubble never sits flush against it. */
const MARGIN = 8

export interface TooltipProps {
  /** The sentence. Usually `copy('some.key')`. */
  text: React.ReactNode
  /**
   * What the mark is called to a screen reader.
   *
   * Defaults to "What this means", which is true but says nothing about which
   * control it belongs to; `Field` passes the label so it reads as "About Model".
   */
  label?: string
  className?: string
}

export function Tooltip({
  text,
  label = 'What this means',
  className = ''
}: TooltipProps): React.JSX.Element {
  const id = useId()
  const mark = useRef<HTMLSpanElement | null>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)

  const open = (): void => {
    const box = mark.current?.getBoundingClientRect()
    if (!box) return

    setAt({
      // Clamped rather than flipped: these sit in a narrow right-hand panel, so
      // the bubble is nearly always against the window edge and a flip would
      // make it jump about between neighbouring fields.
      left: Math.max(MARGIN, Math.min(box.left, window.innerWidth - WIDTH - MARGIN)),
      top: box.bottom + 6
    })
  }

  const close = (): void => setAt(null)

  // Escape closes it, and so does scrolling the panel out from under it —
  // otherwise the bubble hangs in the window pointing at nothing.
  useEffect(() => {
    if (!at) return

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [at])

  return (
    <>
      <span
        ref={mark}
        role="button"
        tabIndex={0}
        className={['ic-tip', className].filter(Boolean).join(' ')}
        aria-label={label}
        aria-describedby={at ? id : undefined}
        aria-expanded={at !== null}
        onPointerEnter={open}
        onPointerLeave={close}
        onFocus={open}
        onBlur={close}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          open()
        }}
        // A tap has no hover. `preventDefault` stops the surrounding label
        // forwarding the press to the control, which would move focus away and
        // shut the tooltip in the same gesture that asked for it.
        onClick={(event) => {
          event.preventDefault()
          open()
        }}
      >
        <Icon name="info" size={12} />
      </span>

      {at && (
        <span
          id={id}
          role="tooltip"
          className="ic-tip__bubble"
          style={{ position: 'fixed', left: at.left, top: at.top, maxWidth: WIDTH }}
        >
          {text}
        </span>
      )}
    </>
  )
}
