// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newQuickhandsMinigame, type MinigameDocument } from '@shared/bundle/minigameDoc'
import { addAsset, addVariant, emptyMedia, newAsset, newVariant } from '@shared/mediaDoc'
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

  it('offers every kind under the one Add button, and closes after choosing', async () => {
    const onChange = panel({ version: 1, minigames: [] })

    expect(screen.queryByRole('menuitem', { name: 'Combat' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('menuitem', { name: 'Quick-hands' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'The Carry' })).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /Upload/ })).toBeInTheDocument()
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
})
