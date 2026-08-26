import { Tooltip } from './Tooltip'

export interface FieldProps {
  label?: React.ReactNode
  /**
   * A short clause set inside the label, in `<em>`.
   *
   * This app's own treatment, and not in the upstream component: it puts the
   * fact right next to the name — "Ink name · Variables are abeline_attribute."
   * — where the eye already is. `hint` still exists for the cases that want a
   * line under the control instead.
   *
   * Written as a sentence, like everything in `shared/copy.json`: capital at
   * the front, full stop at the end, whether it sits here or in a tooltip. The
   * label is uppercased by CSS and the clause is not, so the two read as a
   * heading and a remark rather than as one run-on line.
   */
  note?: React.ReactNode
  /**
   * An explanation, behind an info mark beside the label.
   *
   * The split from `note` is what a label row is *for*. `note` is a fact the
   * app worked out — `seraphine.md`, `variables are kael_attribute`, `3 unfiled`
   * — and belongs on the page where it can be checked at a glance. `about` is
   * writing that teaches, which is worth reading once and then never again, and
   * which printed on every field turns a panel of eight controls into sixteen
   * things to read.
   */
  about?: React.ReactNode
  /** One line, sentence case, explains consequence — not the label again. */
  hint?: React.ReactNode
  /** Replaces the hint and turns it red. */
  error?: React.ReactNode
  /** Inline puts the label in a fixed 96px column; for dense detail panes. */
  inline?: boolean
  /**
   * `label` wraps the control, so it names it implicitly — which is how every
   * control in this app gets its accessible name today, and how the tests find
   * them. `div` is for a group that holds several controls, where a wrapping
   * label would claim all of them for the first one.
   */
  as?: 'label' | 'div'
  htmlFor?: string
  className?: string
  children?: React.ReactNode
}

/**
 * Label + control + hint. The only sanctioned way to name a control.
 *
 * Two deliberate divergences from `.claude/inkcrafter-design/components/controls/Field.jsx`,
 * both recorded in design/README.md:
 *
 * 1. It renders a `<label>` wrapper by default rather than a `<div>` with a
 *    sibling `<label htmlFor>`. The implicit association is what gives 42
 *    controls in this app their accessible name without an id on every one,
 *    and what ~80 test queries rely on. Groups pass `as="div"`.
 * 2. The `note` prop, which is this app's established `<em>`-inside-the-label
 *    treatment — already styled at `styles.css` `.ic-field__label em`.
 */
export function Field({
  label,
  note,
  about,
  hint,
  error,
  inline = false,
  as = 'label',
  htmlFor,
  className = '',
  children
}: FieldProps): React.JSX.Element {
  const classes = ['ic-field', inline ? 'ic-field--inline' : '', className]
    .filter(Boolean)
    .join(' ')

  const heading = label && (
    <span className="ic-field__label">
      {label}
      {note && <em>{note}</em>}
      {about && <Tooltip text={about} label={`About ${typeof label === 'string' ? label : 'this'}`} />}
    </span>
  )

  const body = (
    <>
      {heading}
      {children}
      {(error || hint) && (
        <span className={`ic-field__hint${error ? ' is-error' : ''}`}>{error || hint}</span>
      )}
    </>
  )

  if (as === 'div') return <div className={classes}>{body}</div>
  return (
    <label className={classes} htmlFor={htmlFor}>
      {body}
    </label>
  )
}
