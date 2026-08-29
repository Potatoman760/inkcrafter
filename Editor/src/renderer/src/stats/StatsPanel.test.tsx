// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  addItem,
  addStat,
  emptyStats,
  newItem,
  newStat,
  type StatsDocument
} from '@shared/statsDoc'
import type { NameUse } from '@shared/types'
import { StatsPanel } from './StatsPanel'

function seeded(): StatsDocument {
  let doc = emptyStats()
  doc = addStat(doc, { ...newStat('Strength'), initial: 2 })
  doc = addStat(doc, newStat('Has met Wren', 'boolean'))
  doc = addItem(doc, newItem('Shovel'))
  doc = addItem(doc, newItem('Rope'))
  doc = addItem(doc, newItem('Brass key'))
  return doc
}

interface Harness {
  onChange: ReturnType<typeof vi.fn>
  onOpenUse: ReturnType<typeof vi.fn>
}

function dialog(doc = seeded(), uses: NameUse[] = []): Harness {
  const onChange = vi.fn()
  const onOpenUse = vi.fn()

  render(
    <StatsPanel
      doc={doc}
      saving={false}
      error={null}
      findUses={vi.fn(async () => uses)}
      onChange={onChange}
      onOpenUse={onOpenUse}
    />
  )

  return { onChange, onOpenUse }
}

/** Rendered against real state, for anything that types into a controlled field. */
function live(initial = seeded()): void {
  function Host(): React.JSX.Element {
    const [doc, setDoc] = useState(initial)
    return (
      <StatsPanel
        doc={doc}
        saving={false}
        error={null}
        findUses={vi.fn(async () => [])}
        onChange={setDoc}
        onOpenUse={vi.fn()}
      />
    )
  }
  render(<Host />)
}

const toItems = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('tab', { name: /^Items/ }))
}

const toVars = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('tab', { name: /^Vars/ }))
}

const pick = async (name: string): Promise<void> => {
  await userEvent.click(screen.getByText(name))
}

describe('StatsPanel', () => {
  it('counts what is in the catalogue on its tabs', () => {
    dialog()
    expect(screen.getByRole('tab', { name: /^Stats\s*\(2\)/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Vars\s*\(0\)/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Items\s*\(3\)/ })).toBeInTheDocument()
  })

  // Items were grouped under an author-named category that became its own ink
  // LIST; they share one list now, so the tab is a flat list like the others.
  it('lists every item, ungrouped', async () => {
    dialog()
    await toItems()

    expect(screen.getByText('shovel')).toBeInTheDocument()
    expect(screen.getByText('rope')).toBeInTheDocument()
    expect(screen.getByText('brass_key')).toBeInTheDocument()
  })

  it('says nothing is chosen until something is', () => {
    dialog()
    expect(screen.getByText(/Choose a stat, or add one/)).toBeInTheDocument()
  })

  it('opens a stat’s fields when it is chosen', async () => {
    dialog()
    await pick('strength')

    expect(screen.getByLabelText('Kind of strength')).toHaveValue('number')
    expect(screen.getByLabelText('Starting value of strength')).toHaveValue(2)
  })

  it('shows the declaration a stat will produce', async () => {
    dialog()
    await pick('strength')
    expect(screen.getByText('VAR strength = 2')).toBeInTheDocument()
  })

  it('creates hidden vars on their own tab without presentation fields', async () => {
    live(emptyStats())
    await toVars()
    await userEvent.type(screen.getByLabelText('New var name'), 'Has met Wren')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByDisplayValue('has_met_wren')).toBeInTheDocument()
    expect(screen.queryByText('Display name')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove has_met_wren' })).toHaveTextContent('Remove this var')
  })

  /* Presentation ---------------------------------------------------------- */

  it('seeds the display name from what was typed, keeping the ink name separate', async () => {
    live(emptyStats())

    await userEvent.type(screen.getByLabelText('New stat name'), 'Nerve Left')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    // Selected automatically, so the fields are there to fill in.
    expect(await screen.findByDisplayValue('nerve_left')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Nerve Left')).toBeInTheDocument()
  })

  it('carries a blurb and an icon, which never reach the ink', async () => {
    const { onChange } = dialog()
    await pick('strength')

    await userEvent.type(screen.getByLabelText(/^Icon/), 'icons/str.png')

    expect((onChange.mock.calls.at(-1)![0] as StatsDocument).stats[0]!.icon).toContain('g')
  })

  it('adds and removes custom fields', async () => {
    live()
    await pick('strength')

    await userEvent.click(screen.getByRole('button', { name: '+ field' }))
    await userEvent.type(screen.getByLabelText(/Custom field 1 label/), 'slot')
    await userEvent.type(screen.getByLabelText(/Custom field 1 value/), 'offhand')

    expect(screen.getByLabelText(/Custom field 1 label/)).toHaveValue('slot')

    await userEvent.click(screen.getByLabelText(/Remove custom field 1/))
    expect(screen.queryByLabelText(/Custom field 1 label/)).not.toBeInTheDocument()
  })

  /* Renaming -------------------------------------------------------------- */

  it('renames a stat on blur, keeping its id', async () => {
    const doc = seeded()
    const id = doc.stats[0]!.id
    const { onChange } = dialog(doc)
    await pick('strength')

    const name = screen.getByDisplayValue('strength')
    await userEvent.clear(name)
    await userEvent.type(name, 'might')
    await userEvent.tab()

    const next = onChange.mock.calls.at(-1)![0] as StatsDocument
    expect(next.stats[0]).toMatchObject({ id, name: 'might' })
  })

  it('refuses a rename onto a name already taken, and puts the old one back', async () => {
    const { onChange } = dialog()
    await pick('strength')

    const name = screen.getByDisplayValue('strength')
    await userEvent.clear(name)
    await userEvent.type(name, 'shovel')

    expect(screen.getByText(/already used/)).toBeInTheDocument()

    await userEvent.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('strength')).toBeInTheDocument()
  })

  // Ink already written against the old name stops compiling, and the app
  // cannot safely rewrite it yet — so it says where to look.
  it('warns where the current name is used, and links to it', async () => {
    const uses: NameUse[] = [
      { path: 'ink/main.ink', line: 20, text: '~ has_lantern = true' },
      { path: 'ink/inside.ink', line: 4, text: '{has_lantern: …}' }
    ]
    const { onOpenUse } = dialog(seeded(), uses)
    await pick('strength')

    expect(await screen.findByText(/is used in 2 places/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'ink/main.ink:20' }))
    expect(onOpenUse).toHaveBeenCalledWith(uses[0])
  })

  it('says nothing about uses when there are none', async () => {
    dialog()
    await pick('strength')
    await waitFor(() => expect(screen.queryByText(/is used in/)).not.toBeInTheDocument())
  })

  /* Reordering ------------------------------------------------------------ */

  it('moves a stat down the list', async () => {
    const { onChange } = dialog()

    await userEvent.click(screen.getByLabelText('Move strength down'))

    expect((onChange.mock.calls[0]![0] as StatsDocument).stats.map((s) => s.name)).toEqual([
      'has_met_wren',
      'strength'
    ])
  })

  it('moves an item down the one list', async () => {
    const { onChange } = dialog()
    await toItems()

    await userEvent.click(screen.getByLabelText('Move shovel down'))

    const next = onChange.mock.calls[0]![0] as StatsDocument
    expect(next.items.map((i) => i.name)).toEqual([
      'rope',
      'shovel',
      'brass_key'
    ])
  })

  /**
   * The inventory variable is one fixed name now, not a setting. It offered a
   * rename that rewrote no ink and warned about nothing, while every other name
   * on this screen is renamed through a field that reports where the old one is
   * used — and the assistant was told to write `{inventory ? ring}` regardless.
   */
  it('offers no way to rename the inventory variable', async () => {
    dialog()

    for (const tab of [/^Vars/, /^Items/]) {
      await userEvent.click(screen.getByRole('tab', { name: tab }))
      expect(screen.queryByLabelText('Inventory variable name')).toBeNull()
    }
  })

  it('still keeps the name out of every other name’s way', async () => {
    dialog()

    const box = screen.getByLabelText('New stat name')
    await userEvent.type(box, 'inventory')

    expect(screen.getByText('inventory is the inventory variable.')).toBeInTheDocument()
  })

  /* Adding and removing --------------------------------------------------- */

  it('refuses a new name already taken', async () => {
    dialog()
    await userEvent.type(screen.getByLabelText('New stat name'), 'strength')

    expect(screen.getByText(/already used/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('asks before removing a stat, since ink using it stops compiling', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onChange } = dialog()
    await pick('strength')

    const button = screen.getByRole('button', { name: 'Remove strength' })
    expect(button).toHaveClass('ic-btn--danger')
    expect(button.querySelector('[data-icon="trash-2"]')).not.toBeNull()

    await userEvent.click(button)

    expect(confirm).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('filters the list down', async () => {
    dialog()
    await toItems()

    await userEvent.type(screen.getByLabelText('Filter'), 'brass')

    expect(screen.getByText('brass_key')).toBeInTheDocument()
    expect(screen.queryByText('shovel')).not.toBeInTheDocument()
  })

})

describe('a number stat has a range', () => {
  it('offers min and max, which the document has always carried', async () => {
    dialog()
    await pick('strength')
    expect(screen.getByLabelText('Minimum of strength')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximum of strength')).toBeInTheDocument()
  })

  it('says it is unbounded until both ends are set', async () => {
    dialog()
    await pick('strength')
    expect(screen.getByText(/unbounded/)).toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  })

  it('draws the bar once there is a range to be inside of', async () => {
    live()
    await pick('strength')

    fireEvent.change(screen.getByLabelText('Minimum of strength'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Maximum of strength'), { target: { value: '10' } })

    const meter = await screen.findByRole('meter')
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '10')
    // Strength starts at 2.
    expect(meter).toHaveAttribute('aria-valuenow', '2')
  })

  it('offers no range for a flag, which has no order to be inside of', async () => {
    live()
    await pick('has_met_wren')
    expect(screen.queryByLabelText(/Minimum of/)).not.toBeInTheDocument()
  })
})
