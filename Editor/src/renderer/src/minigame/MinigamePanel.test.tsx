// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  newCombatMinigame,
  newEstateMinigame,
  newPowerStrikeMinigame,
  newQuickhandsMinigame,
  type MinigameDocument
} from '@shared/bundle/minigameDoc'
import { addAsset, addVariant, emptyMedia, newAsset, newVariant } from '@shared/mediaDoc'
import { emptyNpcs } from '@shared/bundle/npcDoc'
import { emptyStats, newVariable } from '@shared/statsDoc'
import { MinigamePanel } from './MinigamePanel'

/** An animation with two still looks, which is what a set is chosen from. */
function withTokens() {
  const asset = newAsset('Guild token', 'animation')
  const gold = newVariant('gold', 'animations/guild_token/gold.png')
  const silver = newVariant('silver', 'animations/guild_token/silver.png')
  let media = addAsset(emptyMedia(), asset)
  media = addVariant(media, asset.id, gold)
  media = addVariant(media, asset.id, silver)
  return { media, asset, gold, silver }
}

let onMediaChangeSpy = vi.fn()

function panel(doc: MinigameDocument, media = emptyMedia()) {
  const onChange = vi.fn()
  onMediaChangeSpy = vi.fn()
  render(
    <MinigamePanel
      doc={doc}
      stats={{ ...emptyStats(), variables: [newVariable('Quickhands result', 'text')] }}
      npcs={emptyNpcs()}
      media={media}
      files={[]}
      project={{ id: 'p', name: 'Test', path: '/tmp/test' } as never}
      saving={false}
      error={null}
      onChange={onChange}
      onMediaChange={onMediaChangeSpy}
      onMediaRescan={vi.fn()}
      onTest={vi.fn().mockResolvedValue(undefined)}
    />
  )
  return onChange
}

describe('MinigamePanel quick-hands authoring', () => {
  it('removes a legacy character opponent from the media catalogue with its combat minigame', async () => {
    const combat = newCombatMinigame('Old combat')
    const opponent = newAsset('Old opponent', 'character')
    combat.opponentAssetId = opponent.id
    const media = addAsset(emptyMedia(), opponent)
    const onChange = panel({ version: 1, minigames: [combat] }, media)

    await userEvent.click(screen.getByRole('button', { name: 'Remove this minigame' }))

    expect(onChange).toHaveBeenCalledWith({ version: 1, minigames: [] })
    expect(onMediaChangeSpy).toHaveBeenCalledWith({ version: 1, assets: [] })
  })

  it('creates a quick-hands encounter without manufacturing media assets', async () => {
    const onChange = panel({ version: 1, minigames: [] })

    // The kinds live behind one Add button now, so the menu has to be opened.
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Quick-hands' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({ kind: 'quickhands', laneCount: { base: 3, modifiers: [] } })]
    }))
  })

  it('creates a carry, which binds no numeric variable of its own', async () => {
    const onChange = panel({ version: 1, minigames: [] })

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'The Carry' }))

    const [[next]] = onChange.mock.calls as [[MinigameDocument]]
    const carry = next.minigames[0]!
    expect(carry).toEqual(expect.objectContaining({ kind: 'carry', staminaMax: { base: 100, modifiers: [] } }))
    // Combat damages a bound variable; a training exercise must not.
    expect(carry).not.toHaveProperty('playerHealthVariable')
  })

  it('creates a villa with an expandable household and a separate persistent ledger', async () => {
    const onChange = panel({ version: 1, minigames: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Villa' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({ kind: 'estate', startingFunds: { base: 80, modifiers: [] }, residents: [] })]
    }))
  })

  // The ledger's numbers are tunings like every other kind's, so they can
  // scale with a stat rather than being plain numbers with a floor.
  it('edits the villa ledger as tunings, on its own tab', async () => {
    const game = newEstateMinigame('Consort villa')
    const onChange = panel({ version: 1, minigames: [game] })

    await userEvent.click(screen.getByRole('tab', { name: 'Ledger' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily stipend base' }), { target: { value: '23' } })

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({ dailyStipend: { base: 23, modifiers: [] } })]
    }))
    expect(screen.queryByText('Advanced household')).toBeNull()
  })

  it('offers every kind under the one Add button, and closes after choosing', async () => {
    const onChange = panel({ version: 1, minigames: [] })

    expect(screen.queryByRole('menuitem', { name: 'Combat' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('menuitem', { name: 'Quick-hands' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'The Carry' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Power Strike' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Combat' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({ kind: 'combat' })]
    }))
    expect(screen.queryByRole('menuitem', { name: 'Combat' })).toBeNull()
  })

  // The flyout stays open on the way to it because the menu sits inside the
  // element carrying the hover handlers. Portal it to the body and the pointer
  // leaves the group the moment it leaves the button. jsdom has no layout, so
  // this asserts the containment the behaviour rests on rather than the hover.
  it('keeps the menu inside the element that owns the hover', async () => {
    panel({ version: 1, minigames: [] })

    const add = screen.getByRole('button', { name: 'Add' })
    const group = add.closest('.minigame-add')
    expect(group).not.toBeNull()

    await userEvent.click(add)

    expect(group).toContainElement(screen.getByRole('menuitem', { name: 'Quick-hands' }))
  })

  it('offers graphics and numeric tuning for an existing encounter', async () => {
    const quickhands = newQuickhandsMinigame('Broodmarket quick hands')
    quickhands.resultVariable = 'quickhands_result'
    const onChange = panel({ version: 1, minigames: [quickhands] })

    expect(screen.getAllByRole('combobox', { name: 'Valuable tokens 1' })).toHaveLength(1)
    expect(screen.getAllByRole('option', { name: 'Built-in shape' })).toHaveLength(3)
    expect(screen.getByRole('spinbutton', { name: 'Lanes base' })).toHaveValue(3)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Lanes base' }), { target: { value: '4' } })

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({ laneCount: { base: 4, modifiers: [] } })]
    }))
  })

  // The set is edited as its own rows: the blank one on the end adds, and
  // choosing the built-in shape in a filled row drops it.
  it('adds a second token look through the blank row', async () => {
    const { media, asset, gold } = withTokens()
    const quickhands = newQuickhandsMinigame('Broodmarket quick hands')
    quickhands.resultVariable = 'quickhands_result'
    const onChange = panel({ version: 1, minigames: [quickhands] }, media)

    // An empty set offers exactly one row, and it is the blank one.
    expect(screen.getAllByRole('combobox', { name: /^Valuable tokens/ })).toHaveLength(1)

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Valuable tokens 1' }),
      `${asset.id}:${gold.id}`
    )

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({ targetArt: [{ assetId: asset.id, variantId: gold.id }] })]
    }))
  })

  // Without this the panel could only ever choose from pictures somebody had
  // already filed elsewhere, which for a new cabinet is nothing at all.
  it('offers somewhere to bring a picture in when the cabinet has no artwork yet', async () => {
    const quickhands = newQuickhandsMinigame('Broodmarket quick hands')
    quickhands.resultVariable = 'quickhands_result'
    const onChange = panel({ version: 1, minigames: [quickhands] })

    await userEvent.click(screen.getByRole('button', { name: 'Add artwork for this cabinet' }))

    expect(onMediaChangeSpy).toHaveBeenCalledWith(expect.objectContaining({
      assets: [expect.objectContaining({ kind: 'animation', name: quickhands.name })]
    }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows the look list once the cabinet has its own artwork', () => {
    const quickhands = newQuickhandsMinigame('Broodmarket quick hands')
    quickhands.resultVariable = 'quickhands_result'
    const asset = newAsset(quickhands.name, 'animation')
    panel({ version: 1, minigames: [quickhands] }, addAsset(emptyMedia(), asset))

    expect(screen.queryByRole('button', { name: 'Add artwork for this cabinet' })).toBeNull()
    // The look list's own upload; every picture slot has one of its own too.
    expect(screen.getByRole('button', { name: 'Upload…' })).toBeInTheDocument()
  })

  it('gives the villa its plans, interiors and notice board as picture slots, each with upload', async () => {
    panel({ version: 1, minigames: [newEstateMinigame('Consort villa')] })

    // The floor plan is the villa's background, so the generic slot would be
    // the same picture twice.
    expect(screen.queryByText('Scene background')).toBeNull()
    const slots = async (...labels: string[]) => {
      for (const slot of labels) {
        expect(screen.getByLabelText(slot)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: `Upload for ${slot}` })).toBeInTheDocument()
      }
    }
    await slots('Floor plan', 'Disabled map', 'Room background', 'Unrestored art')
    await userEvent.click(screen.getByRole('tab', { name: 'Commissions' }))
    await slots('Notice board')
  })

  it('authors an earning deadline without changing the calendar countdown', async () => {
    const villa = newEstateMinigame('Consort villa')
    villa.calendar = { day: 'villa_day', settled: 'villa_settled', lastDay: 9, lastWorkday: 8 }
    const changed = panel({ version: 1, minigames: [villa] })
    await userEvent.click(screen.getByRole('tab', { name: 'Ledger' }))
    expect(screen.getByRole('spinbutton', { name: 'Calendar last workday' })).toHaveValue(8)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Calendar last workday' }), { target: { value: '7' } })
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ minigames: [expect.objectContaining({
      calendar: { day: 'villa_day', settled: 'villa_settled', lastDay: 9, lastWorkday: 7 }
    })] }))
  })

  it('drops a look when its row is set back to the built-in shape', async () => {
    const { media, asset, gold, silver } = withTokens()
    const quickhands = newQuickhandsMinigame('Broodmarket quick hands')
    quickhands.resultVariable = 'quickhands_result'
    quickhands.targetArt = [
      { assetId: asset.id, variantId: gold.id },
      { assetId: asset.id, variantId: silver.id }
    ]
    const onChange = panel({ version: 1, minigames: [quickhands] }, media)

    // Two looks plus the blank row waiting for a third.
    expect(screen.getAllByRole('combobox', { name: /^Valuable tokens/ })).toHaveLength(3)

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Valuable tokens 1' }),
      ''
    )

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({ targetArt: [{ assetId: asset.id, variantId: silver.id }] })]
    }))
  })

  it('creates and tunes a power-strike encounter', async () => {
    const onChange = panel({ version: 1, minigames: [] })

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Power Strike' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      minigames: [expect.objectContaining({
        kind: 'powerstrike',
        targetDurability: { base: 100, modifiers: [] },
        strikeLimit: { base: 7, modifiers: [] }
      })]
    }))
  })

  it('offers ordered target art and power tuning', () => {
    const strike = newPowerStrikeMinigame('Honeyed Bee woodpile')
    strike.resultVariable = 'quickhands_result'
    panel({ version: 1, minigames: [strike] })

    expect(screen.getByRole('combobox', { name: 'Target stage 1' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tool' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Ideal power base' })).toHaveValue(78)
    expect(screen.getByRole('button', { name: 'Add artwork for this power strike' })).toBeInTheDocument()
  })
})
