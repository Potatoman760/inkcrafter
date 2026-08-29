import type { CustomField } from '@shared/statsDoc'
import { Button, Field, IconButton, Input } from '../design/components'
import { copy } from '@shared/copy'

interface CustomFieldsProps {
  fields: CustomField[]
  /** What the fields belong to, so the labels are unique on the page. */
  owner: string
  onChange: (fields: CustomField[]) => void
}

/**
 * Arbitrary pairs the app stores and never interprets.
 *
 * Kept as an ordered array rather than an object, because that is the shape
 * editing wants: a half-typed label is not a key collision, and two rows can
 * briefly share a name without one eating the other. The conversion to an object
 * happens once, in the export.
 */
export function CustomFields({ fields, owner, onChange }: CustomFieldsProps): React.JSX.Element {
  const set = (index: number, changes: Partial<CustomField>): void =>
    onChange(fields.map((field, at) => (at === index ? { ...field, ...changes } : field)))

  return (
    <Field as="div" label="Custom" about={copy('stats.custom')}>
      <ul className="custom-fields">
        {fields.map((field, index) => (
          // Index as key: the rows are positional and a label is edited
          // character by character, so keying on it would remount on every
          // keystroke and lose the caret.
          <li key={index}>
            <Input
              value={field.label}
              aria-label={`Custom field ${index + 1} label for ${owner}`}
              placeholder="slot"
              onChange={(event) => set(index, { label: event.target.value })}
            />
            <Input
              value={field.value}
              aria-label={`Custom field ${index + 1} value for ${owner}`}
              placeholder="offhand"
              onChange={(event) => set(index, { value: event.target.value })}
            />
            <IconButton icon="x" label={`Remove custom field ${index + 1} from ${owner}`}
              onClick={() => onChange(fields.filter((_, at) => at !== index))}
             />
          </li>
        ))}
      </ul>

      <Button className="custom-add" onClick={() => onChange([...fields, { label: '', value: '' }])}>
        + field
      </Button>
    </Field>
  )
}
