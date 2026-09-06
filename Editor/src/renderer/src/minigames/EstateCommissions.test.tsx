// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ESTATE_CONTRACT_LIMIT, ESTATE_CONTRACTS, type EstateMinigame } from '@shared/bundle/estate'
import { newEstateMinigame } from '@shared/bundle/minigameDoc'
import { EstateCommissions } from './EstateCommissions'

/**
 * The notices, as rows.
 *
 * A villa that never wrote any shows the built-in six and the first edit
 * writes them down, so the board is never half-authored.
 */

function mount(contracts?: EstateMinigame['contracts']) {
  const game = { ...newEstateMinigame('Villa'), ...(contracts ? { contracts } : {}) }
  const changed = vi.fn()
  function Host() {
    const [value, setValue] = useState(game)
    return (
      <EstateCommissions
        game={value}
        onChange={(changes) => { changed(changes); setValue((previous) => ({ ...previous, ...changes })) }}
      />
    )
  }
  render(<Host />)
  return { changed }
}

const last = (changed: ReturnType<typeof vi.fn>): Partial<EstateMinigame> => changed.mock.lastCall?.[0]

describe('EstateCommissions', () => {
  it('shows the built-in board, and writes all of it down on the first edit', () => {
    const { changed } = mount()
    expect(screen.getByLabelText('Notice 1 name')).toHaveValue('Herb delivery')
    expect(screen.queryByRole('button', { name: 'Use the built-in six' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Notice 1 pay'), { target: { value: '21' } })

    expect(last(changed).contracts).toHaveLength(ESTATE_CONTRACTS.length)
    expect(last(changed).contracts?.[0]).toEqual({ ...ESTATE_CONTRACTS[0], pay: 21 })
    expect(screen.getByRole('button', { name: 'Use the built-in six' })).toBeInTheDocument()
  })

  it('keeps a crew need within what any day can supply', () => {
    const { changed } = mount()

    fireEvent.change(screen.getByLabelText('Notice 2 builders'), { target: { value: '9' } })
    expect(last(changed).contracts?.[1]?.needs).toEqual([0, 4, 1])

    fireEvent.change(screen.getByLabelText('Notice 2 builders'), { target: { value: '-3' } })
    expect(last(changed).contracts?.[1]?.needs).toEqual([0, 0, 1])
  })

  it('adds up to the board\'s limit, removes down to one, and can go back to the built-in six', async () => {
    const { changed } = mount([{ name: 'Roof tiles', needs: [0, 3, 0], pay: 20 }])
    expect(screen.getByRole('button', { name: 'Remove notice 1' })).toBeDisabled()

    for (let n = 1; n < ESTATE_CONTRACT_LIMIT; n += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Add notice' }))
    }
    expect(last(changed).contracts).toHaveLength(ESTATE_CONTRACT_LIMIT)
    expect(screen.getByRole('button', { name: 'Add notice' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Remove notice 2' }))
    expect(last(changed).contracts?.map((one) => one.name)).toEqual(['Roof tiles', 'New notice', 'New notice', 'New notice', 'New notice'])

    await userEvent.click(screen.getByRole('button', { name: 'Use the built-in six' }))
    expect(last(changed)).toEqual({ contracts: undefined })
    expect(screen.getByLabelText('Notice 1 name')).toHaveValue('Herb delivery')
  })
})
