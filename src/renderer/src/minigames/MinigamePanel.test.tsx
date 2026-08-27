// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newQuickhandsMinigame, type MinigameDocument } from '@shared/bundle/minigameDoc'
import { emptyMedia } from '@shared/mediaDoc'
import { emptyStats, newVariable } from '@shared/statsDoc'
import { MinigamePanel } from './MinigamePanel'

function panel(doc: MinigameDocument) {
  const onChange = vi.fn()
  render(
    <MinigamePanel
      doc={doc}
      stats={{ ...emptyStats(), variables: [newVariable('Quickhands result', 'text')] }}
      media={emptyMedia()}
      files={[]}
      project={null}
      saving={false}
      error={null}
      onChange={onChange}
      onMediaChange={vi.fn()}
      onMediaRescan={vi.fn()}
      onTest={vi.fn().mockResolvedValue(undefined)}
    />
  )
  return onChange
}

describe('MinigamePanel quick-hands authoring', () => {
  it('creates a quick-hands encounter without manufacturing media assets', async () => {
    const onChange = panel({ version: 1, minigames: [] })

    await userEvent.click(screen.getByRole('button', { name: 'Add quick-hands' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({ kind: 'quickhands', laneCount: { base: 3, modifiers: [] } })]
    }))
  })

  it('offers graphics and numeric tuning for an existing encounter', async () => {
    const quickhands = newQuickhandsMinigame('Broodmarket quick hands')
    quickhands.resultVariable = 'quickhands_result'
    const onChange = panel({ version: 1, minigames: [quickhands] })

    expect(screen.getAllByRole('combobox', { name: 'Valuable token' })).toHaveLength(1)
    expect(screen.getAllByRole('option', { name: 'Built-in shape' })).toHaveLength(3)
    expect(screen.getByRole('spinbutton', { name: 'Lanes base' })).toHaveValue(3)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Lanes base' }), { target: { value: '4' } })

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({ laneCount: { base: 4, modifiers: [] } })]
    }))
  })
})
