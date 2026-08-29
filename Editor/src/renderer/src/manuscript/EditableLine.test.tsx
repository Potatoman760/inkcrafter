// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EDITABLE } from '@shared/manuscript'
import { EditableLine } from './EditableLine'

const LOCKED = {
  editable: false,
  reason: 'The runtime built this text rather than reading it from the file.'
}

function line(
  props: Partial<Parameters<typeof EditableLine>[0]> = {}
): ReturnType<typeof vi.fn> {
  const onSave = vi.fn()
  render(
    <EditableLine text="It turns." edit={EDITABLE} className="prose-line" onSave={onSave} {...props}>
      It turns.
    </EditableLine>
  )
  return onSave
}

describe('EditableLine', () => {
  it('opens an editor on double-click', async () => {
    line()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await userEvent.dblClick(screen.getByText('It turns.'))
    expect(screen.getByRole('textbox')).toHaveValue('It turns.')
  })

  it('will not open for text the runtime assembled', async () => {
    line({ edit: LOCKED })

    await userEvent.dblClick(screen.getByText('It turns.'))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('explains why a locked line cannot be edited', () => {
    line({ edit: LOCKED })
    expect(screen.getByTitle(LOCKED.reason)).toBeInTheDocument()
  })

  it('saves on Enter', async () => {
    const onSave = line()

    await userEvent.dblClick(screen.getByText('It turns.'))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), 'It sticks, then turns.{Enter}')

    expect(onSave).toHaveBeenCalledWith('It sticks, then turns.')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('reverts on Escape without saving', async () => {
    const onSave = line()

    await userEvent.dblClick(screen.getByText('It turns.'))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), 'Discard me.{Escape}')

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('It turns.')).toBeInTheDocument()
  })

  it('does not save an unchanged line', async () => {
    const onSave = line()

    await userEvent.dblClick(screen.getByText('It turns.'))
    await userEvent.tab()

    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses to empty a line, since ink has no blank statement to write', async () => {
    const onSave = line()

    await userEvent.dblClick(screen.getByText('It turns.'))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.tab()

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('It turns.')).toBeInTheDocument()
  })

  it('saves on blur', async () => {
    const onSave = line()

    await userEvent.dblClick(screen.getByText('It turns.'))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), 'Rewritten.')
    await userEvent.tab()

    expect(onSave).toHaveBeenCalledWith('Rewritten.')
  })
})
