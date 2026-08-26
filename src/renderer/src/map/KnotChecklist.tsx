import { useState } from 'react'
import { knotsIn, planKnotGroups, type KnotGroup } from '@shared/plan'
import type { KnotSource } from '@shared/inkKnots'
import type { PlanDocument } from '@shared/planDoc'
import { Checkbox, Hint, IconButton } from '../design/components'

interface KnotChecklistProps {
  /** Every knot the story declares, with the file that declares it. */
  knots: KnotSource[]
  plan: PlanDocument
  /** The knots checked now. */
  selected: string[]
  onChange: (next: string[]) => void
}

/**
 * Choosing knots, in the shape the plan puts them in.
 *
 * A dropdown of forty identifiers is the wrong control for this. What an author
 * means is "the whole of chapter one", and picking that out of an alphabetical
 * list means knowing which of `at_the_gate`, `the_hall` and `the_road` belong to
 * it — which is exactly what the plan already records. So the plan is the
 * ordering, and a chapter is one click.
 *
 * A group is checked only when everything under it is. Partly-checked is shown
 * as a count rather than as the indeterminate state, which is a DOM property
 * rather than an attribute and would need a ref per row to set: "2 of 5" says
 * more than a dash does anyway, and it says it in a list you are scanning.
 *
 * A knot is filed by the *file* it was declared in, not by its name — see
 * `planKnotGroups`. A Scene owns an ink file, and a Scene called "Forest
 * encounter" whose file declares `chapter1_forest` and four more owns all
 * five of them.
 *
 * Collapsed by default unless something inside is checked, so a story with
 * twelve acts opens on the ones this map is actually about. The initial state is
 * read once; remount it — the panel keys it by map — to recompute it.
 */
export function KnotChecklist({
  knots,
  plan,
  selected,
  onChange
}: KnotChecklistProps): React.JSX.Element {
  const groups = planKnotGroups(plan, knots)
  const chosen = new Set(selected)

  /**
   * Open on the way to whatever is already checked.
   *
   * With nothing checked there is no path to show, so the acts open instead:
   * that puts every chapter's own checkbox on screen without a click, which is
   * the gesture this control exists for. A chapter stays shut until it is asked
   * for, because its knots are the part nobody needs to read.
   */
  const [open, setOpen] = useState<Set<string>>(() => {
    const found = new Set<string>()
    const walk = (list: KnotGroup[]): void => {
      for (const one of list) {
        if (knotsIn(one).some((knot) => chosen.has(knot))) found.add(one.id)
        walk(one.groups)
      }
    }
    walk(groups)
    return found.size > 0 ? found : new Set(groups.map((one) => one.id))
  })

  if (knots.length === 0) {
    return <Hint tight>The story has no knots yet, so there is nowhere to be the map for.</Hint>
  }

  /** Adds or removes a whole group's worth at once, never a mixture. */
  const setMany = (many: string[], on: boolean): void =>
    onChange(
      on
        ? [...selected, ...many.filter((knot) => !chosen.has(knot))]
        : selected.filter((knot) => !many.includes(knot))
    )

  const groupRow = (group: KnotGroup, depth: number): React.JSX.Element => {
    const mine = knotsIn(group)
    const on = mine.filter((knot) => chosen.has(knot))
    const all = on.length === mine.length
    const showing = open.has(group.id)

    return (
      <li key={group.id || 'unplanned'} className={`knot-group knot-group--${depth}`}>
        <div className="knot-group__head">
          <IconButton
            size="xs"
            icon={showing ? 'chevron-down' : 'chevron-right'}
            label={`${showing ? 'Collapse' : 'Expand'} ${group.title}`}
            onClick={() =>
              setOpen((current) => {
                const next = new Set(current)
                if (!next.delete(group.id)) next.add(group.id)
                return next
              })
            }
          />
          <Checkbox
            label={group.title}
            checked={all}
            // A count rather than a dash: it says which way the group is
            // leaning, and how far, while the list is being scanned.
            trail={
              <span className="knot-count">
                {on.length > 0 && !all ? `${on.length} of ${mine.length}` : mine.length}
              </span>
            }
            onChange={(event) => setMany(mine, event.target.checked)}
          />
        </div>

        {showing && (
          <ul className="knot-list">
            {group.groups.map((one) => groupRow(one, depth + 1))}
            {group.knots.map((knot) => (
              <li key={knot}>
                <Checkbox
                  className="knot-row"
                  label={<code>{knot}</code>}
                  checked={chosen.has(knot)}
                  onChange={(event) => setMany([knot], event.target.checked)}
                />
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <>
      <ul className="knot-list knot-list--top">{groups.map((group) => groupRow(group, 0))}</ul>

      {/* Knots the plan accounts for are grouped; a plan with nothing in it
          leaves every knot in one bucket, which is worth explaining rather than
          leaving to look like a bug. */}
      {plan.nodes.length === 0 && (
        <Hint tight>
          Nothing is planned yet, so every knot is in one list. Build the plan and these group
          themselves by act and chapter.
        </Hint>
      )}
    </>
  )
}
