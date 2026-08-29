// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InkOutline } from './InkOutline'

/**
 * The outline's job is to be a way *to* somewhere, so the two things worth
 * asserting are that it lists the places a reader can actually reach, and that
 * clicking one names the line it lives on.
 */

const FILE = [
  'VAR courage = 0', // 1
  '', // 2
  '=== grove ===', // 3
  '# bg: grove', // 4
  'You have arrived.', // 5
  '', // 6
  '= waiting', // 7
  'The light shifts.', // 8
  '', // 9
  '=== function tally(x) ===', // 10
  '~ return x', // 11
  '', // 12
  '=== harbour ===', // 13
  'Gulls.' // 14
].join('\n')

const BROKEN = '=== grove ===\n{ unclosed\n=== harbour ==='

function shown(): string[] {
  return screen.getAllByRole('button').map((one) => one.textContent ?? '')
}

describe('InkOutline', () => {
  it('lists the knots and stitches with their lines', () => {
    render(<InkOutline source={FILE} here={null} onGo={vi.fn()} />)

    expect(shown()).toEqual(['grove3', 'waiting7', 'harbour13'])
  })

  /**
   * A function is called, never travelled to. Listing it would offer a click
   * that takes the author somewhere the reader can never be.
   */
  it('leaves functions out', () => {
    render(<InkOutline source={FILE} here={null} onGo={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /tally/ })).not.toBeInTheDocument()
  })

  it('goes to the line the scene starts on', async () => {
    const onGo = vi.fn()
    render(<InkOutline source={FILE} here={null} onGo={onGo} />)

    await userEvent.click(screen.getByRole('button', { name: /harbour/ }))

    expect(onGo).toHaveBeenCalledWith(13)
  })

  /** A stitch arrives as `knot.stitch`, which is how the editor reports it. */
  it('marks the one the cursor is in', () => {
    render(<InkOutline source={FILE} here="grove.waiting" onGo={vi.fn()} />)

    expect(screen.getByRole('button', { name: /waiting/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /grove/ })).not.toHaveAttribute('aria-current')
  })

  /**
   * A half-typed file is exactly when a long file is hardest to navigate, so
   * the outline reads headers rather than waiting for something that compiles.
   */
  it('still lists what it can while the file is broken', () => {
    render(<InkOutline source={BROKEN} here={null} onGo={vi.fn()} />)

    expect(shown()).toEqual(['grove1', 'harbour3'])
  })

  it('says so when there is nothing to list', () => {
    render(<InkOutline source="Just prose." here={null} onGo={vi.fn()} />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText(/No knots yet/)).toBeInTheDocument()
  })
})
