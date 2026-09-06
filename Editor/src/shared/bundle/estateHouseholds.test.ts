import { describe, expect, it } from 'vitest'
import { actOnEstate, estateBathGuests, estateBathPercent, estateSpriteBounds, estateInvitationRoom, estateRoomCapacity, estateRoomResidents, newEstateState, readEstateState } from './estate'
import { newEstateMinigame, parseMinigames, serialiseMinigames } from './minigameDoc'

const game = newEstateMinigame('Villa')
game.rooms = [
  { key: 'hall', name: 'Hall', cost: 0, beds: 0, residentKey: null, requires: null, description: '' },
  { key: 'garden', name: 'Garden', cost: 45, beds: 2, residentKey: 'lira', companionKey: 'piri', inviteTogether: true, requires: 'missing', description: '' },
  { key: 'spare', name: 'Spare', cost: 0, beds: 2, requires: null, description: '', startsActive: true }
]
game.residents = ['lira', 'piri', 'third'].map(key => ({ key, name: key, eligibilityVariable: key + '_ready', requirement: '', sprite: '', scenes: [] }))
const act = (state: ReturnType<typeof newEstateState>, action: Parameters<typeof actOnEstate>[1], read = (_: string) => true) => actOnEstate(state, action, game, read, 18, 0)
const restored = () => act(newEstateState(100, game.rooms), { kind: 'restore', key: 'garden' })

describe('two-person villa households', () => {
  it('finds the figure rather than counting transparent top and side margins', () => {
    const pixels = new Uint8ClampedArray(4 * 5 * 4)
    pixels[(2 * 4 + 1) * 4 + 3] = 255; pixels[(4 * 4 + 2) * 4 + 3] = 180
    expect(estateSpriteBounds(4, 5, pixels)).toEqual({ x: 1, y: 2, width: 2, height: 3 })
    expect(estateSpriteBounds(4, 5, new Uint8ClampedArray(pixels.length))).toEqual({ x: 0, y: 0, width: 4, height: 5 })
  })
  it('bounds visible percentages and round-trips the separate bathing backdrop', () => {
    expect([undefined, NaN, Infinity, -5, 0, 27, 120].map(estateBathPercent)).toEqual([40, 40, 40, 5, 5, 27, 100])
    const config = { ...game, rooms: game.rooms.map(room => ({ ...room, bathingBackground: { assetId: 'villa', variantId: 'water' } })),
      residents: game.residents.map(resident => ({ ...resident, bathVisiblePercent: 27 })) }
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [config] })).minigames).toEqual([config])
  })
  it('shows only current residents of enabled homes in restored shared baths, without moving them', () => {
    const config = { ...game, rooms: [...game.rooms,
      { key: 'baths', name: 'Baths', cost: 5, beds: 0, residentKey: null, requires: null, description: '', sharedBaths: true, availabilityVariable: 'bath_open' }] }
    const invited = act(restored(), { kind: 'invite', key: 'lira', room: 'garden' })
    expect(estateBathGuests(invited, config, 'baths', () => true)).toEqual([])
    const state = actOnEstate(invited, { kind: 'restore', key: 'baths' }, config, () => true, 18, 0)
    const before = JSON.stringify(state)
    expect(estateBathGuests(state, config, 'baths', () => true).map(one => one.key)).toEqual(['lira', 'piri'])
    expect(JSON.stringify(state)).toBe(before)
    expect(state.assignments).toEqual({ lira: 'garden', piri: 'garden' })
    expect(estateBathGuests(state, config, 'garden', () => true)).toEqual([])
    expect(estateBathGuests(state, config, 'baths', () => false)).toEqual([])
    const hiddenHome = { ...config, rooms: config.rooms.map(room => room.key === 'garden' ? { ...room, availabilityVariable: 'hide' } : room) }
    expect(estateBathGuests(state, hiddenHome, 'baths', flag => flag !== 'hide')).toEqual([])
    const departed = actOnEstate(state, { kind: 'farewell', key: 'piri' }, config, () => true, 18, 0)
    expect(estateBathGuests(departed, config, 'baths', () => true)).toEqual([])
  })
  it('round-trips special bath portraits and keeps missing slots optional', () => {
    const config = { ...game, rooms: game.rooms.map(room => ({ ...room, sharedBaths: room.key === 'hall' })),
      residents: game.residents.map((resident, index) => ({ ...resident, bathSprite: index ? null : { assetId: 'character', variantId: 'bath' } })) }
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [config] })).minigames).toEqual([config])
  })
  it('ignores all legacy restoration dependencies but still charges crowns', () => {
    const state = restored()
    expect(state.rooms).toContain('garden'); expect(state.crowns).toBe(55)
    expect(act(state, { kind: 'restore', key: 'garden' })).toBe(state)
  })
  it('round-trips roommate and joint-invitation settings', () => {
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [game] })).minigames).toEqual([game])
    expect(estateRoomCapacity({ ...game.rooms[2]!, beds: 10 })).toBe(2)
  })
  it('requires both gates and enough space, then invites the pair atomically', () => {
    const state = restored(), partial = (key: string) => key === 'lira_ready'
    expect(estateInvitationRoom(state, game, 'lira', 'garden', partial)).toBeUndefined()
    for (const key of ['lira', 'piri']) expect(act(state, { kind: 'invite', key, room: 'garden' }, partial)).toBe(state)
    const joined = act(state, { kind: 'invite', key: 'piri', room: 'garden' })
    expect(estateRoomResidents(joined, 'garden')).toEqual(['lira', 'piri'])
    expect(act(joined, { kind: 'invite', key: 'lira', room: 'garden' })).toBe(joined)
    expect(act(joined, { kind: 'invite', key: 'third', room: 'garden' })).toBe(joined)
    expect(act(state, { kind: 'invite', key: 'piri', room: 'spare' })).toBe(state)
    const undersized = { ...game, rooms: game.rooms.map(room => room.key === 'garden' ? { ...room, beds: 1 } : room) }
    expect(actOnEstate(state, { kind: 'invite', key: 'lira' }, undersized, () => true, 18, 0)).toBe(state)
  })
  it('preserves old Lira-only saves and offers the missing companion only after her gate', () => {
    const old = { ...restored(), residents: ['lira'], assignments: { lira: 'garden' } }
    const loaded = readEstateState(JSON.stringify(old), 80, game.rooms)
    expect(loaded.residents).toEqual(['lira'])
    expect(act(loaded, { kind: 'invite', key: 'lira', room: 'garden' }, () => false)).toBe(loaded)
    const complete = act(loaded, { kind: 'invite', key: 'lira', room: 'garden' })
    expect(complete.residents).toEqual(['lira', 'piri'])
    expect(complete.crowns).toBe(old.crowns)
    expect(act(complete, { kind: 'farewell', key: 'piri' }).residents).toEqual([])
  })
  it('also supports independently invited roommates', () => {
    const separate = { ...game, rooms: game.rooms.map(room => ({ ...room, inviteTogether: false })) }
    const first = actOnEstate(restored(), { kind: 'invite', key: 'lira' }, separate, () => true, 18, 0)
    const both = actOnEstate(first, { kind: 'invite', key: 'piri' }, separate, () => true, 18, 0)
    expect(estateRoomResidents(both, 'garden')).toEqual(['lira', 'piri'])
    expect(actOnEstate(both, { kind: 'farewell', key: 'piri' }, separate, () => true, 18, 0).residents).toEqual(['lira'])
  })
})
