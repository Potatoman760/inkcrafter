// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newEstateMinigame } from '@shared/bundle/minigameDoc'
import type { EstateTutorial } from '@shared/bundle/estate'
import { EstateTutorialFields } from './EstateTutorialFields'

const tutorial: EstateTutorial = { version: 1, autoStart: true, speaker: { name: 'Isolde', sprite: 'isolde' },
  steps: [{ title: 'Welcome', text: 'Your villa.', page: 'villa', target: 'overview' }] }
function mount() {
  const changed = vi.fn()
  function Host() {
    const [game, setGame] = useState({ ...newEstateMinigame('Villa'), tutorial: tutorial as EstateTutorial | null })
    return <EstateTutorialFields game={game} portraits={['isolde']} onChange={update => {
      changed(update); setGame(previous => ({ ...previous, ...update }))
    }} />
  }
  render(<Host />)
  const edit = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Tutorial JSON' }), { target: { value } })
  const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply JSON' }))
  return { changed, edit, apply }
}
describe('raw tutorial editor', () => {
  it('applies valid JSON explicitly and permits null to disable it', () => {
    const { changed, edit, apply } = mount()
    const next = { ...tutorial, version: 2 }
    edit(JSON.stringify(next)); expect(changed).not.toHaveBeenCalled(); apply()
    expect(changed).toHaveBeenLastCalledWith({ tutorial: next })
    expect(screen.getByRole('button', { name: 'Apply JSON' })).toBeDisabled()
    edit('null'); apply(); expect(changed).toHaveBeenLastCalledWith({ tutorial: null })
  })
  it('keeps invalid drafts without damaging the saved script and allows reverting', () => {
    const { changed, edit, apply } = mount()
    edit('{'); apply(); expect(changed).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('{')
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
    expect(screen.getByRole('textbox')).toHaveValue(JSON.stringify(tutorial, null, 2))
  })
  it('rejects unknown rooms and missing guide sprites', () => {
    const { changed, edit, apply } = mount()
    edit(JSON.stringify({ ...tutorial, steps: [{ ...tutorial.steps[0], room: 'missing' }] })); apply()
    expect(screen.getByText('Unknown room: missing')).toBeInTheDocument()
    edit(JSON.stringify({ ...tutorial, speaker: { name: 'Isolde', sprite: 'missing' } })); apply()
    expect(screen.getByText('Speaker sprite is not in the character catalogue.')).toBeInTheDocument()
    expect(changed).not.toHaveBeenCalled()
  })
})
