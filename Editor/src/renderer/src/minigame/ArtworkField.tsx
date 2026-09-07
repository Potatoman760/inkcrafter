import type { GalleryMediaRef } from '@shared/bundle/galleryDoc'
import { ArtField, refKey, type ArtOption } from './ArtField'

/**
 * A set of looks, edited as the rows themselves.
 *
 * One row per picture plus a blank one on the end, so adding and removing are
 * the same gesture — choose in the blank row to add, choose "Built-in shape" in
 * a filled row to drop it. No buttons to explain, and no way to leave a hole in
 * the middle of the set.
 *
 * Every row is numbered rather than only the first being labelled: `Field` drops
 * an empty label, and a select with no accessible name is one a screen reader
 * cannot announce and a test cannot find.
 */
export function ArtworkListField({ label, value, options, onChange }: {
  label: string
  value: GalleryMediaRef[]
  options: ArtOption[]
  onChange: (next: GalleryMediaRef[]) => void
}): React.JSX.Element {
  const rows: (GalleryMediaRef | null)[] = [...value, null]

  return (
    <div className="quickhands-art-list">
      {rows.map((ref, index) => (
        <ArtworkField
          key={`${index}:${ref ? refKey(ref) : 'add'}`}
          label={`${label} ${index + 1}`}
          value={ref}
          options={options}
          onChange={(next) => {
            const kept = value.filter((_, at) => at !== index)
            onChange(next ? [...value.slice(0, index), next, ...value.slice(index + 1)] : kept)
          }}
        />
      ))}
    </div>
  )
}

/** A sprite slot: the shared picker, whose empty choice is the built-in shape. */
export function ArtworkField({ label, value, options, onChange }: {
  label: string
  value: GalleryMediaRef | null
  options: ArtOption[]
  onChange: (next: GalleryMediaRef | null) => void
}): React.JSX.Element {
  return (
    <ArtField
      label={label}
      value={value}
      options={options}
      shape="sprite"
      emptyLabel="Built-in shape"
      onChange={onChange}
    />
  )
}
