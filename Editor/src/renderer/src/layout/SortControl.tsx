import { IconButton, Segmented } from '../design/components'
import type { Sort, SortField } from '@shared/modified'

/**
 * How a long catalogue list is being read.
 *
 * A `Segmented` rather than a tab strip, on the design system's own rule: this
 * switches a control's setting, not the pane's content. The list underneath is
 * the same list either way.
 *
 * The direction is a separate button rather than a third and fourth segment,
 * and rather than a second click on the chosen one. Four segments would say
 * these are four unrelated orders when they are two read two ways, and a
 * re-click on a selected radio is a gesture nothing else in this app uses and
 * no keyboard would find.
 */
const FIELDS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'modified', label: 'Modified' }
]

/** What reversing would give you, said as the thing the button does. */
const REVERSE_TO: Record<SortField, { forwards: string; backwards: string }> = {
  name: { forwards: 'Sort Z to A', backwards: 'Sort A to Z' },
  modified: { forwards: 'Sort oldest first', backwards: 'Sort newest first' }
}

export function SortControl({
  value,
  onChange,
  className = ''
}: {
  value: Sort
  onChange: (next: Sort) => void
  className?: string
}): React.JSX.Element {
  const words = REVERSE_TO[value.by]

  return (
    <div className={['sort-control', className].filter(Boolean).join(' ')}>
      <Segmented
        label="Sort by"
        value={value.by}
        // Changing the field keeps the direction: somebody who reads their
        // variables Z to A means it about the next field too.
        onChange={(next) => onChange({ ...value, by: next as SortField })}
        options={FIELDS}
      />
      <IconButton
        icon={value.reversed ? 'chevron-up' : 'chevron-down'}
        size="sm"
        label={value.reversed ? words.backwards : words.forwards}
        onClick={() => onChange({ ...value, reversed: !value.reversed })}
      />
    </div>
  )
}
