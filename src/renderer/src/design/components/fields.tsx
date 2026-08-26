/**
 * The text controls: Input, Textarea, Select, Checkbox, Segmented.
 *
 * One file because they are one idea — a value the author types or picks — and
 * because they share the `.ic-input, .ic-textarea, .ic-select` shell in
 * `components/controls.css`.
 */

/**
 * `size` is the system's control height, not the HTML attribute of the same
 * name — which is a character count nothing in this app uses. Omitted from the
 * native props so the two cannot be confused.
 */
export interface InputProps extends Omit<React.ComponentPropsWithRef<'input'>, 'size'> {
  /** Monospace: file paths, knot names, ink identifiers, model ids. */
  mono?: boolean
  invalid?: boolean
  size?: 'sm' | 'md'
}

/**
 * Single-line input.
 *
 * Wrap it in a Field whenever it needs a name. A placeholder shows a real
 * example rather than repeating the label — `ink/act-two`, not `File path`.
 */
export function Input({
  mono = false,
  invalid = false,
  size = 'md',
  className = '',
  ...rest
}: InputProps): React.JSX.Element {
  const classes = [
    'ic-input',
    mono ? 'ic-input--mono' : '',
    invalid ? 'ic-input--invalid' : '',
    size === 'sm' ? 'ic-input--sm' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return <input className={classes} aria-invalid={invalid || undefined} {...rest} />
}

export interface TextareaProps extends React.ComponentPropsWithRef<'textarea'> {
  /** Monospace: ink source. Prose stays in the interface face. */
  mono?: boolean
}

/** Multi-line input, for summaries, instructions and ink drafts. */
export function Textarea({
  mono = false,
  rows = 4,
  className = '',
  ...rest
}: TextareaProps): React.JSX.Element {
  const classes = ['ic-textarea', mono ? 'ic-textarea--mono' : '', className]
    .filter(Boolean)
    .join(' ')

  return <textarea className={classes} rows={rows} {...rest} />
}

/** `size` is the control height here too — see InputProps. */
export interface SelectProps extends Omit<React.ComponentPropsWithRef<'select'>, 'size'> {
  size?: 'sm' | 'md'
}

/**
 * Native select in the system's shell.
 *
 * Four or more mutually exclusive options; two or three want a Segmented. The
 * options stay native so keyboard and platform behaviour come for free — this
 * is deliberately not a custom listbox.
 */
export function Select({
  size = 'md',
  className = '',
  children,
  ...rest
}: SelectProps): React.JSX.Element {
  const classes = ['ic-select', size === 'sm' ? 'ic-select--sm' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <select className={classes} {...rest}>
      {children}
    </select>
  )
}

export interface CheckboxProps extends Omit<React.ComponentPropsWithRef<'input'>, 'type'> {
  /** Required. States the on-state as a fact: "Link this library", not a question. */
  label: React.ReactNode
  /**
   * A quiet aside pushed to the right end of the row — what kind of thing the
   * label names, not a second action. Sits beside the label rather than inside
   * it, so it can be laid out against the far edge.
   */
  trail?: React.ReactNode
}

/** A checkbox and its label as one hit target. */
export function Checkbox({
  label,
  trail,
  disabled = false,
  className = '',
  ...rest
}: CheckboxProps): React.JSX.Element {
  const classes = ['ic-check', disabled ? 'is-disabled' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={classes}>
      <input type="checkbox" disabled={disabled} {...rest} />
      <span>{label}</span>
      {trail}
    </label>
  )
}

export interface SegmentedOption {
  value: string
  label: React.ReactNode
}

export interface SegmentedProps {
  /** Two to four. More than that is a Select. */
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  /** Names the group for a screen reader, since the options are unlabelled. */
  label?: string
}

/**
 * A compact exclusive switch — plan Grid/Matrix, the word-limit presets.
 *
 * Not a tab strip: it switches a control's setting, not the pane's content.
 */
export function Segmented({
  options,
  value,
  onChange,
  className = '',
  label
}: SegmentedProps): React.JSX.Element {
  return (
    <div
      className={['ic-segmented', className].filter(Boolean).join(' ')}
      // A divergence: the kit says "not a tab strip — it switches a control's
      // setting, not the pane's content", then renders role="tablist". A tab
      // announces a panel that follows it; these announce a value. Radio is
      // what the kit's own sentence describes.
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
