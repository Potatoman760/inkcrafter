// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyPlan, planFromMarkdown, type PlanDocument } from '@shared/planDoc'
import type { KnotSource } from '@shared/inkKnots'
import { KnotChecklist } from './KnotChecklist'

/**
 * Choosing knots in the shape the plan puts them in.
 *
 * The whole point is that "the whole of chapter one" is one click. An
 * alphabetical list of identifiers cannot be asked that, which is what this
 * replaces — so what matters is that a group really does carry everything under
 * it, and that a knot the plan knows nothing about is still reachable.
 */

const PLAN = planFromMarkdown(
  [
    '# Act One',
    '',
    '## Arrival',
    '',
    '### At the gate',
    '',
    '### The hall',
    '',
    '## Departure',
    '',
    '### The road',
    ''
  ].join('\n')
)

/**
 * What the ink would actually declare for that plan, plus one it does not.
 *
 * Named after their Scenes here, so the *name* fallback is what places them —
 * these Scenes have no files. `plan.test.ts` covers the file path, which is what
 * places a knot in a real project.
 */
const KNOTS: KnotSource[] = ['at_the_gate', 'the_hall', 'the_road', 'overworld_hub'].map(
  (knot) => ({ knot, file: `unowned/${knot}.ink` })
)

function list(
  selected: string[] = [],
  options: { knots?: KnotSource[]; plan?: PlanDocument } = {}
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn()
  render(
    <KnotChecklist
      knots={options.knots ?? KNOTS}
      plan={options.plan ?? PLAN}
      selected={selected}
      onChange={onChange}
    />
  )
  return onChange
}

/** Rendered against real state, for anything that checks then reads back. */
function live(initial: string[] = []): void {
  function Host(): React.JSX.Element {
    const [selected, setSelected] = useState(initial)
    return (
      <KnotChecklist knots={KNOTS} plan={PLAN} selected={selected} onChange={setSelected} />
    )
  }
  render(<Host />)
}

const box = (name: string | RegExp): HTMLElement => screen.getByRole('checkbox', { name })

describe('KnotChecklist', () => {
  it('groups the knots by act and chapter, and says how many are in each', async () => {
    list(['at_the_gate'])

    expect(box(/^Act One/)).toBeInTheDocument()
    // Open, because something inside it is checked.
    expect(box(/^Arrival/)).toBeInTheDocument()
    expect(box('at_the_gate')).toBeChecked()
    expect(box('the_hall')).not.toBeChecked()
  })

  /** The reason this exists at all. */
  it('checks every knot under a chapter at once', async () => {
    const onChange = list()

    await userEvent.click(box(/^Arrival/))

    expect(onChange).toHaveBeenCalledWith(['at_the_gate', 'the_hall'])
  })

  it('checks a whole act, chapters and all', async () => {
    const onChange = list()

    await userEvent.click(box(/^Act One/))

    expect(onChange).toHaveBeenCalledWith(['at_the_gate', 'the_hall', 'the_road'])
  })

  it('unchecks a whole group without disturbing anything outside it', async () => {
    const onChange = list(['at_the_gate', 'the_hall', 'the_road'])

    await userEvent.click(box(/^Arrival/))

    expect(onChange).toHaveBeenCalledWith(['the_road'])
  })

  it('adds nothing twice when part of a group is already checked', async () => {
    const onChange = list(['at_the_gate'])

    await userEvent.click(box(/^Arrival/))

    expect(onChange).toHaveBeenCalledWith(['at_the_gate', 'the_hall'])
  })

  /**
   * A count rather than the indeterminate state, which is a DOM property and
   * would need a ref per row. It also says more: how far, not just "partly".
   */
  it('counts how much of a group is checked while it is only partly checked', () => {
    list(['at_the_gate'])

    expect(box(/^Arrival/)).not.toBeChecked()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
  })

  it('checks the group once everything under it is', () => {
    live(['at_the_gate', 'the_hall'])
    expect(box(/^Arrival/)).toBeChecked()
  })

  it('keeps a knot the plan does not account for, in a group of its own', async () => {
    const onChange = list()

    await userEvent.click(box(/^Not in the plan/))

    expect(onChange).toHaveBeenCalledWith(['overworld_hub'])
  })

  /** A stitch belongs to whatever its knot belongs to, and rides with it. */
  it('files a stitch under the Scene that declares its knot', async () => {
    const onChange = list([], {
      knots: [...KNOTS, { knot: 'at_the_gate.inside', file: 'unowned/at_the_gate.ink' }]
    })

    await userEvent.click(box(/^Arrival/))

    expect(onChange).toHaveBeenCalledWith(['at_the_gate', 'at_the_gate.inside', 'the_hall'])
  })

  describe('collapsing', () => {
    it('opens only the groups this map has something in', () => {
      list(['the_road'])

      expect(box(/^Departure/)).toBeInTheDocument()
      // Act One is open because it holds Departure; Not in the plan is not.
      expect(screen.queryByRole('checkbox', { name: 'overworld_hub' })).toBeNull()
    })

    it('opens the one group there is, since hiding it gains nothing', () => {
      list([], { plan: emptyPlan() })
      expect(box('overworld_hub')).toBeInTheDocument()
    })

    it('opens and closes on the chevron', async () => {
      list()
      expect(box('overworld_hub')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Collapse Not in the plan' }))
      expect(screen.queryByRole('checkbox', { name: 'overworld_hub' })).toBeNull()

      await userEvent.click(screen.getByRole('button', { name: 'Expand Not in the plan' }))
      expect(box('overworld_hub')).toBeInTheDocument()
    })

    /** A chapter's knots are the part nobody needs to read to pick a chapter. */
    it('leaves a chapter shut until it is asked for', async () => {
      list()

      expect(box(/^Arrival/)).toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: 'at_the_gate' })).toBeNull()

      await userEvent.click(screen.getByRole('button', { name: 'Expand Arrival' }))
      expect(box('at_the_gate')).toBeInTheDocument()
    })
  })

  it('says so when the story has no knots at all', () => {
    list([], { knots: [] })
    expect(screen.getByText(/no knots yet/)).toBeInTheDocument()
  })

  it('explains why nothing is grouped when nothing is planned', () => {
    list([], { plan: emptyPlan() })
    expect(screen.getByText(/Nothing is planned yet/)).toBeInTheDocument()
  })
})
