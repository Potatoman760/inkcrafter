import { describe, expect, it } from 'vitest'
import { actOnEstate, availableEstateRoom, commissionBoard, commissionQuote, ESTATE_CONTRACT_LIMIT, ESTATE_CONTRACTS, estateCalendar, estateCapacity, estateConfiguration, estateFinaleReady, estateGoalProgress, settleWorkday, estatePlanSize, estateRoomBackground, estateRoomEnabled, estateRoomResidents, estateSceneEnabled, estateWorkdayOpen, newEstateState, readEstateState, type EstateRoom } from './estate'
import { newEstateMinigame, parseMinigames, serialiseMinigames } from './minigameDoc'

const game = newEstateMinigame('Villa')
game.residents = Array.from({ length: 10 }, (_, i) => ({ key: `guest${i}`, name: `Guest ${i}`, eligibilityVariable: `eligible${i}`,
  requirement: 'Complete the relationship', sprite: '', scenes: [{ room: 'garden', result: `evening${i}`, title: 'An evening' }] }))
const act = (state: ReturnType<typeof newEstateState>, action: Parameters<typeof actOnEstate>[1], eligible = true) =>
  actOnEstate(state, action, game, () => eligible, 18, 0)

describe('villa economy and household progression', () => {
  it('round-trips room encounters and requires all participants to remain eligible residents with available restored homes', () => {
    const villa = newEstateMinigame('Ambient villa')
    villa.rooms = [
      { key: 'pool', name: 'Pool', cost: 0, beds: 0, residentKey: null, requires: null, description: '' },
      { key: 'a', name: 'A', cost: 0, beds: 1, residentKey: 'a', requires: null, description: '' },
      { key: 'b', name: 'B', cost: 0, beds: 1, residentKey: 'b', availabilityVariable: 'b_room', requires: null, description: '' }
    ]
    villa.residents = ['a', 'b'].map(key => ({ key, name: key, eligibilityVariable: `${key}_ok`, requirement: '', sprite: '', scenes: [] }))
    villa.encounters = [{ room: 'pool', result: 'pool_chat', title: 'Poolside questions', cue: 'Voices carry over the water.', residents: ['a', 'b'], gate: 'ready' }]
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [villa] })).minigames).toEqual([villa])
    const state = { ...newEstateState(80, villa.rooms), rooms: ['pool', 'a', 'b'], residents: ['a', 'b'], assignments: { a: 'a', b: 'b' } }
    const action = { kind: 'encounter' as const, result: 'pool_chat' }
    const run = (ledger = state, read = (_key: string): boolean => true) => actOnEstate(ledger, action, villa, read, 18, 0, read)
    expect(run()).not.toBe(state)
    expect(run()).toEqual(state)
    const absent = { ...state, residents: ['a'] }
    expect(run(absent)).toBe(absent)
    const noHome = { ...state, assignments: { a: 'a', b: '' } }
    expect(run(noHome)).toBe(noHome)
    for (const missing of ['pool', 'b']) {
      const locked = { ...state, rooms: state.rooms.filter(key => key !== missing) }
      expect(run(locked)).toBe(locked)
    }
    for (const missing of ['b_ok', 'b_room', 'ready']) expect(run(state, key => key !== missing)).toBe(state)
    expect(actOnEstate(state, { kind: 'encounter', result: 'unknown' }, villa, () => true, 18, 0)).toBe(state)
  })
  it('round-trips the new kind, including author-defined rooms and invitation gates', () => {
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [game] })).minigames).toEqual([game])
  })

  it('derives authored goals and latches finale readiness only after the minimum day', () => {
    const villa = newEstateMinigame('Goal villa')
    villa.rooms = [
      { key: 'hall', name: 'Hall', cost: 0, beds: 0, startsActive: true, residentKey: null, requires: null, description: '' },
      { key: 'staff', name: 'Staff room', cost: 10, beds: 1, residentKey: 'staff', requires: null, description: '' },
      { key: 'guest', name: 'Guest room', cost: 10, beds: 1, residentKey: 'guest', requires: null, description: '' }
    ]
    villa.residents = [
      { key: 'staff', name: 'Staff', eligibilityVariable: 'staff_ok', requirement: '', sprite: '', scenes: [] },
      { key: 'guest', name: 'Guest', eligibilityVariable: 'guest_ok', requirement: '', sprite: '', scenes: [] }
    ]
    villa.goals = [
      { id: 'room', title: 'Restore', text: 'Done.', required: true, condition: { kind: 'room', room: 'staff' } },
      { id: 'arc', title: 'Arc', text: 'Done.', required: true, condition: { kind: 'variable', variable: 'arc_done' } },
      { id: 'guests', title: 'Guests', text: 'Done.', required: true, condition: { kind: 'residents', count: 2, exclude: ['staff'] } }
    ]
    villa.finale = { minimumDay: 9, readyVariable: 'ready', requiredGoalIds: ['room', 'arc', 'guests'] }
    const flags = new Set(['staff_ok', 'guest_ok', 'arc_done'])
    const read = (name: string): boolean => flags.has(name)
    let state = newEstateState(30, villa.rooms)
    state = actOnEstate(state, { kind: 'restore', key: 'staff' }, villa, read, 18, 0, read)
    state = actOnEstate(state, { kind: 'restore', key: 'guest' }, villa, read, 18, 0, read)
    state = actOnEstate(state, { kind: 'invite', key: 'guest' }, villa, read, 18, 0, read)
    expect(estateGoalProgress(villa.goals[2]!, state, villa, read)).toMatchObject({ complete: true, current: 1, target: 1 })
    expect(estateFinaleReady(state, villa, 8, read)).toBe(false)
    expect(estateFinaleReady(state, villa, 9, read)).toBe(true)
    flags.delete('guest_ok')
    expect(estateGoalProgress(villa.goals[2]!, state, villa, read)).toMatchObject({ complete: true, target: 0 })
  })

  it('restores in any order while checking funds and duplicate purchases', () => {
    let state = newEstateState(80)
    expect(act(state, { kind: 'restore', key: 'west' }).rooms).toContain('west')
    state = act(state, { kind: 'restore', key: 'east' })
    expect(state.crowns).toBe(50)
    expect(estateCapacity(state, game.rooms)).toBe(3)
    expect(act(state, { kind: 'restore', key: 'east' })).toBe(state)
    state = act(state, { kind: 'restore', key: 'east_2' })
    expect(act(state, { kind: 'restore', key: 'garden' })).toBe(state)
  })

  it('gates invitations by previous relationships, capacity and duplicate residents', () => {
    let state = newEstateState(80)
    expect(act(state, { kind: 'invite', key: 'guest0' }, false)).toBe(state)
    state = act(state, { kind: 'invite', key: 'guest0' })
    expect(act(state, { kind: 'invite', key: 'guest0' })).toBe(state)
    state = act(state, { kind: 'invite', key: 'guest1' })
    expect(act(state, { kind: 'invite', key: 'guest2' })).toBe(state)
    state = act(state, { kind: 'restore', key: 'east' })
    expect(state.residents).toEqual(['guest0', 'guest1', 'guest2'])
  })

  it('requires a resident and restored room for scenes, then preserves history across reloads', () => {
    let state = newEstateState(80)
    expect(act(state, { kind: 'scene', result: 'evening0' })).toBe(state)
    state = act(state, { kind: 'invite', key: 'guest0' })
    expect(act(state, { kind: 'scene', result: 'evening0' })).toBe(state)
    state = act(state, { kind: 'restore', key: 'garden' })
    state = act(state, { kind: 'scene', result: 'evening0' })
    expect(readEstateState(JSON.stringify(state), 80)).toEqual(state)
    expect(state.seen).toEqual([])
    expect(() => readEstateState('{broken}', 80)).toThrow()
    expect(() => readEstateState(JSON.stringify({ ...state, version: 4 }), 80)).toThrow()
  })

  it('rejects impossible staffing and duplicate contracts, preserving a saved draft', () => {
    let state = newEstateState(80)
    state = act(state, { kind: 'contract', index: 0 })
    expect(readEstateState(JSON.stringify(state), 80).selected).toEqual([0])
    expect(act(state, { kind: 'contract', index: 3 })).toBe(state)
    expect(commissionQuote(1, [0, 0]).valid).toBe(false)
    expect(commissionQuote(1, [99]).valid).toBe(false)
    const next = act(state, { kind: 'settle' })
    expect(next.crowns).toBe(80 + 18 + commissionQuote(1, [0]).pay)
    expect(next.day).toBe(2)
    expect(next.selected).toEqual([])
    expect(act(next, { kind: 'settle' }).crowns).toBe(next.crowns + 18)
    expect(commissionBoard(2)).not.toEqual(commissionBoard(1))
  })

  it('pays stat bonuses once per nonempty day, not per contract or on idle days', () => {
    expect(commissionQuote(1, [], 12).pay).toBe(0)
    expect(commissionQuote(1, [1, 2, 5], 12).pay).toBe(64)
    const state = { ...newEstateState(80), selected: [1, 2, 5] }
    const next = actOnEstate(state, { kind: 'settle' }, game, () => true, 18, 12)
    expect(next.crowns).toBe(162)
    expect(next.selected).toEqual([])
    expect(actOnEstate(next, { kind: 'settle' }, game, () => true, 18, 12).crowns).toBe(180)
  })

  it('makes the entire villa attainable in 9–13 optimized days, or 34 stipend-only days', () => {
    const cost = game.rooms.reduce((sum, room) => sum + room.cost, 0)
    expect(cost).toBe(675)
    expect(Math.ceil((cost - 80) / 18)).toBe(34)
    let state = newEstateState(80)
    while (state.crowns < cost && state.day < 40) {
      const choices = Array.from({ length: 64 }, (_, mask) => Array.from({ length: 6 }, (_, i) => i).filter(i => mask & (1 << i)))
      const best = choices.filter(indices => commissionQuote(state.day, indices).valid)
        .sort((a, b) => commissionQuote(state.day, b).pay - commissionQuote(state.day, a).pay)[0]!
      state = act({ ...state, selected: best }, { kind: 'settle' })
    }
    expect(state.day - 1).toBeGreaterThanOrEqual(9)
    expect(state.day - 1).toBeLessThanOrEqual(13)
    for (const room of game.rooms) state = act(state, { kind: 'restore', key: room.key })
    expect(state.rooms).toHaveLength(14)
    expect(estateCapacity(state, game.rooms)).toBe(10)
    expect(state.crowns).toBeGreaterThanOrEqual(0)
  })

  it('invites into the chosen restored suite and refuses one already taken', () => {
    let state = newEstateState(80)
    expect(state.rooms).toEqual(['hall', 'suite_1', 'suite_2'])
    expect(act(state, { kind: 'invite', key: 'guest0', room: 'east' })).toBe(state)
    expect(act(state, { kind: 'invite', key: 'guest0', room: 'hall' })).toBe(state)
    state = act(state, { kind: 'invite', key: 'guest0', room: 'suite_2' })
    expect(estateRoomResidents(state, 'suite_2')).toEqual(['guest0'])
    expect(availableEstateRoom(state, game.rooms, 'suite_2')).toBeUndefined()
    expect(act(state, { kind: 'invite', key: 'guest1', room: 'suite_2' })).toBe(state)
    state = act(state, { kind: 'invite', key: 'guest1', room: 'suite_1' })
    expect(readEstateState(JSON.stringify(state), 80).assignments).toEqual({ guest0: 'suite_2', guest1: 'suite_1' })
    expect(availableEstateRoom(state, game.rooms)).toBeUndefined()
  })

  it('migrates purchased wings and places old residents without losing any progress', () => {
    const old = { version: 1, day: 7, crowns: 132, rooms: ['hall', 'east', 'west', 'garden'], residents: ['guest0', 'guest1', 'guest2', 'guest3', 'guest4', 'guest5'], seen: ['evening0'], selected: [1], lastIncome: 33 }
    const migrated = readEstateState(JSON.stringify(old), 80)
    expect(migrated.version).toBe(3)
    expect(migrated.rooms).toEqual(expect.arrayContaining(['hall', 'suite_1', 'suite_2', 'east', 'east_2', 'west', 'west_2', 'garden']))
    expect(estateCapacity(migrated, game.rooms)).toBe(6)
    expect(new Set(Object.values(migrated.assignments)).size).toBe(6)
    expect(migrated).toMatchObject({ day: 7, crowns: 132, residents: old.residents, seen: old.seen, selected: [1], lastIncome: 33 })
    expect(readEstateState(JSON.stringify(migrated), 80)).toEqual(migrated)
  })

  it('respects custom starting rooms and preserves displaced residents when authors reduce capacity', () => {
    const rooms = [{ key: 'custom', name: 'Custom', beds: 1, startsActive: true, cost: 0, requires: null, description: '' }]
    const initial = newEstateState(42, rooms)
    expect(initial.rooms).toEqual(['custom'])
    const restored = readEstateState(JSON.stringify({ ...initial, residents: ['guest0', 'guest1'], assignments: { guest0: 'removed', guest1: 'custom' } }), 80, rooms)
    expect(restored.residents).toEqual(['guest0', 'guest1'])
    expect(restored.assignments).toEqual({ guest1: 'custom' })
    expect(restored.crowns).toBe(42)
  })

  it('round-trips image coordinates and validates malformed geometry', () => {
    expect(game.rooms.every(room => room.bounds)).toBe(true)
    expect(estateConfiguration({ rooms: [{ ...game.rooms[0], bounds: { x: 1, y: 2, width: -1, height: 9 } }] }).rooms).toEqual([])
    expect(estatePlanSize({ width: 800, height: 900 })).toEqual({ width: 800, height: 900 })
    expect(estatePlanSize({ width: 0, height: 0 })).toEqual(game.floorPlanSize)
    expect(() => readEstateState(JSON.stringify({ ...newEstateState(80), assignments: { guest0: 23 } }), 80)).toThrow()
  })
})

describe('character-specific homes', () => {
  it('keeps availability separate from restoration, invitations and saved ownership', () => {
    const villa = newEstateMinigame('Gated villa')
    villa.rooms = [{ key: 'hall', name: 'Hall', beds: 0, cost: 0, requires: null, description: '' },
      { key: 'home', name: 'Private room', beds: 1, cost: 30, requires: 'hall', description: '', residentKey: 'faye', availabilityVariable: 'faye_complete' }]
    villa.residents = [{ key: 'faye', name: 'Faye', eligibilityVariable: 'invitable', requirement: '', sprite: '', scenes: [{ room: 'hall', result: 'visit', title: 'Visit' }] }]
    villa.disabledFloorPlan = { assetId: 'plan', variantId: 'empty' }
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [villa] })).minigames).toEqual([villa])
    const home = villa.rooms[1]!, initial = newEstateState(80, villa.rooms)
    expect(estateRoomEnabled(home, () => false)).toBe(false)
    expect(estateRoomEnabled(villa.rooms[0]!, () => false)).toBe(true)
    expect(actOnEstate(initial, { kind: 'restore', key: 'home' }, villa, () => true, 18, 0, () => false)).toBe(initial)
    const restored = actOnEstate(initial, { kind: 'restore', key: 'home' }, villa, () => true, 18, 0)
    expect(restored.crowns).toBe(50)
    expect(estateCapacity(restored, villa.rooms, () => false)).toBe(0)
    expect(availableEstateRoom(restored, villa.rooms, undefined, 'faye', () => false)).toBeUndefined()
    expect(actOnEstate(restored, { kind: 'invite', key: 'faye' }, villa, () => true, 18, 0, () => false)).toBe(restored)
    const invited = actOnEstate(restored, { kind: 'invite', key: 'faye' }, villa, () => true, 18, 0)
    expect(actOnEstate(invited, { kind: 'scene', result: 'visit' }, villa, () => true, 18, 0, () => false)).toBe(invited)
    const saved = readEstateState(JSON.stringify(invited), 80, villa.rooms)
    expect(saved).toEqual(invited)
    expect(estateCapacity(saved, villa.rooms, () => true)).toBe(1)
    expect(actOnEstate(saved, { kind: 'scene', result: 'visit' }, villa, () => true, 18, 0).seen).not.toContain('visit')
    villa.rooms[0]!.availabilityVariable = 'hall_enabled'
    expect(actOnEstate(saved, { kind: 'scene', result: 'visit' }, villa, () => true, 18, 0, name => name !== 'hall_enabled')).toBe(saved)
  })
  it('round-trips room and notice board artwork without changing the ledger', () => {
    const villa = newEstateMinigame('Illustrated villa')
    const ref = { assetId: 'villa-art', variantId: 'room-look' }
    villa.rooms[1] = { ...villa.rooms[1]!, background: ref, unrestoredBackground: { ...ref, variantId: 'empty' } }
    villa.noticeboardBackground = { ...ref, variantId: 'board-look' }
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [villa] })).minigames).toEqual([villa])
    const saved = JSON.stringify(newEstateState(80, villa.rooms))
    villa.rooms[1] = { ...villa.rooms[1]!, background: { ...ref, variantId: 'replacement' } }
    expect(readEstateState(saved, 80, villa.rooms)).toEqual(JSON.parse(saved))
  })

  it('drops malformed artwork references without dropping authored rooms', () => {
    const room = { ...newEstateMinigame('Villa').rooms[0]!, background: { assetId: 42 }, unrestoredBackground: { variantId: 'missing-asset' } }
    expect(estateConfiguration({ rooms: [room] }).rooms).toEqual([{ ...room, background: null, unrestoredBackground: null }])
  })
  it('switches empty artwork on restoration and preserves the choice through saves and reset', () => {
    const villa = newEstateMinigame('Villa')
    const room = villa.rooms.find(one => one.key === 'east')!
    room.background = { assetId: 'interiors', variantId: 'furnished' }
    room.unrestoredBackground = { assetId: 'interiors', variantId: 'empty' }
    const initial = newEstateState(80, villa.rooms)
    expect(estateRoomBackground(room, initial)).toEqual(room.unrestoredBackground)
    const restored = actOnEstate(initial, { kind: 'restore', key: room.key }, villa, () => true, 18, 0)
    expect(estateRoomBackground(room, restored)).toEqual(room.background)
    expect(estateRoomBackground(room, readEstateState(JSON.stringify(restored), 80, villa.rooms))).toEqual(room.background)
    expect(estateRoomBackground(room, newEstateState(80, villa.rooms))).toEqual(room.unrestoredBackground)
    expect(estateRoomBackground({ ...room, unrestoredBackground: null }, initial)).toEqual(room.background)
    expect(estateRoomBackground({ ...room, background: null, unrestoredBackground: null }, initial)).toBeNull()
  })
  const rooms: EstateRoom[] = [
    { key: 'hall', name: 'Hall', beds: 0, residentKey: null, cost: 0, startsActive: true, requires: null, description: '' },
    { key: 'bedroom', name: 'Maren’s den', beds: 1, residentKey: 'maren', cost: 0, startsActive: true, requires: 'hall', description: '' },
    { key: 'garden', name: 'Lira’s fountain', beds: 1, residentKey: 'lira', cost: 45, requires: 'hall', description: '' },
    { key: 'spare', name: 'Legacy spare', beds: 2, cost: 0, startsActive: true, requires: 'hall', description: '' }
  ]
  const config = { rooms, residents: ['maren', 'lira'].map(key => ({ key, name: key, eligibilityVariable: key + '_eligible', requirement: '', sprite: '', scenes: [] })) }
  const invite = (state: ReturnType<typeof newEstateState>, key: string, room?: string, eligible = true) =>
    actOnEstate(state, { kind: 'invite', key, room }, config, () => eligible, 18, 0)

  it('blocks all wrong-room paths, including automatic household invitations and legacy spare suites', () => {
    const initial = newEstateState(80, rooms)
    expect(invite(initial, 'lira', 'bedroom')).toBe(initial)
    expect(invite(initial, 'lira', 'spare')).toBe(initial)
    expect(invite(initial, 'lira')).toBe(initial)
    expect(availableEstateRoom(initial, rooms, undefined, 'lira')).toBeUndefined()
    const restored = actOnEstate(initial, { kind: 'restore', key: 'garden' }, config, () => true, 18, 0)
    expect(invite(restored, 'maren', 'garden')).toBe(restored)
    expect(invite(restored, 'lira', 'garden', false)).toBe(restored)
    const invited = invite(restored, 'lira')
    expect(invited.assignments).toEqual({ lira: 'garden' })
    expect(invited.crowns).toBe(35)
    expect(invite(invited, 'lira')).toBe(invited)
  })

  it('never lends a dedicated home to someone else, empty or occupied', () => {
    const empty = newEstateState(80, rooms)
    expect(invite(empty, 'lira', 'bedroom')).toBe(empty)
    const housed = invite(empty, 'maren')
    expect(housed.assignments).toEqual({ maren: 'bedroom' })
    expect(invite(housed, 'lira', 'bedroom')).toBe(housed)
  })

  it('rehomes old residents without charging, evicting them or losing history', () => {
    const old = { ...newEstateState(7, rooms), day: 8, residents: ['lira', 'maren'], assignments: { lira: 'bedroom', maren: 'spare' }, seen: ['old_scene'], selected: [1] }
    const migrated = readEstateState(JSON.stringify(old), 80, rooms)
    expect(migrated.assignments).toEqual({ lira: 'garden', maren: 'bedroom' })
    expect(migrated.rooms).toContain('garden')
    expect(migrated).toMatchObject({ crowns: 7, day: 8, residents: ['lira', 'maren'], seen: ['old_scene'], selected: [1] })
    expect(readEstateState(JSON.stringify(migrated), 80, rooms)).toEqual(migrated)
    const legacy = { ...old, version: 1, assignments: undefined }
    expect(readEstateState(JSON.stringify(legacy), 80, rooms).assignments).toEqual(migrated.assignments)
  })

  it('round-trips dedicated and shared spaces and never treats shared furniture as capacity', () => {
    const configured = { ...newEstateMinigame('Custom homes'), rooms, residents: config.residents }
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [configured] })).minigames).toEqual([configured])
    const shared = [{ ...rooms[1]!, residentKey: null, beds: 4 }]
    expect(estateCapacity(newEstateState(80, shared), shared)).toBe(0)
    expect(availableEstateRoom(newEstateState(80, shared), shared, undefined, 'maren')).toBeUndefined()
    expect(estateConfiguration({ rooms: [{ ...rooms[0], residentKey: 15 }] }).rooms).toEqual([])
  })
})

/**
 * The notices are authored now, where they used to be a constant. A villa that
 * never wrote any keeps the built-in board, so nothing already made changes.
 */
describe('authored commission notices', () => {
  const notices = [
    { name: 'Roof tiles', needs: [0, 4, 0] as [number, number, number], pay: 20 },
    { name: 'Wine cellar', needs: [1, 1, 1] as [number, number, number], pay: 9 }
  ]

  it('round-trips them, and leaves them absent for a villa that has none', () => {
    const villa = { ...newEstateMinigame('Villa'), contracts: notices }
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [villa] })).minigames[0]).toEqual(villa)
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [game] })).minigames[0]).not.toHaveProperty('contracts')
  })

  it('puts the authored notices on the board, with the same daily rise in pay', () => {
    const board = commissionBoard(1, notices)
    expect(board.contracts.map(one => one.name)).toEqual(['Roof tiles', 'Wine cellar'])
    expect(board.contracts.map(one => one.pay)).toEqual([20, 11])
    expect(commissionBoard(1).contracts).toHaveLength(ESTATE_CONTRACTS.length)
  })

  it("quotes and settles against the villa's own notices", () => {
    const villa = { ...game, contracts: notices }
    let state = newEstateState(50, villa.rooms)
    state = actOnEstate(state, { kind: 'contract', index: 0 }, villa, () => true, 18, 0)
    expect(state.selected).toEqual([0])
    // Day one's plentiful crew is the builders, at four, and the roof wants all of them: the cellar cannot join it.
    expect(actOnEstate(state, { kind: 'contract', index: 1 }, villa, () => true, 18, 0).selected).toEqual([0])
    state = actOnEstate(state, { kind: 'settle' }, villa, () => true, 18, 0)
    expect(state.lastIncome).toBe(18 + 20)
  })

  it('reads only well-formed notices, and no more than the board holds', () => {
    const many = Array.from({ length: ESTATE_CONTRACT_LIMIT + 2 }, (_, i) => ({ name: `Job ${i}`, needs: [1, 0, 0], pay: 10 }))
    expect(estateConfiguration({ contracts: many }).contracts).toHaveLength(ESTATE_CONTRACT_LIMIT)
    expect(estateConfiguration({ contracts: [{ name: 'Bad', needs: [1, 0], pay: 10 }, { name: 'Worse', needs: [1, 0, 0], pay: -1 }] }).contracts).toEqual([])
    expect(estateConfiguration({})).not.toHaveProperty('contracts')
  })
})

/**
 * A story calendar. The villa stops owning the day: it is told which day it
 * is, pays that day's work once, and never advances anything itself.
 */
describe('a chapter-managed villa', () => {
  it('rejects gated scene actions without marking them seen, and allows them once unlocked', () => {
    const scene = { room: 'suite_1', result: 'private_visit', title: 'Private visit', gate: 'door_open' }
    const villa = { ...game, residents: [{ ...game.residents[0]!, scenes: [scene] }] }
    const invited = actOnEstate(newEstateState(80, villa.rooms), { kind: 'invite', key: 'guest0' }, villa, () => true, 18, 0)
    const closed = (name: string): boolean => name !== 'door_open'
    expect(estateSceneEnabled(scene, closed)).toBe(false)
    expect(estateSceneEnabled({ ...scene, gate: undefined }, closed)).toBe(true)
    expect(actOnEstate(invited, { kind: 'scene', result: scene.result }, villa, closed, 18, 0)).toBe(invited)
    expect(invited.seen).toEqual([])
    const visited = actOnEstate(invited, { kind: 'scene', result: scene.result }, villa, () => true, 18, 0)
    expect(visited).not.toBe(invited)
    expect(visited.seen).toEqual([])
  })

  it('ends earnings after the last workday without closing restorations or standalone play', () => {
    const calendar = { day: 'day', settled: 'paid', lastDay: 9, lastWorkday: 8 }
    const villa = { ...game, calendar }
    const state = { ...newEstateState(80, villa.rooms), day: 9, selected: [0] }
    expect(estateWorkdayOpen(calendar, 8)).toBe(true)
    expect(estateWorkdayOpen(calendar, 9)).toBe(false)
    expect(estateWorkdayOpen(calendar, 20)).toBe(false)
    expect(estateWorkdayOpen(calendar, 0)).toBe(false)
    expect(estateWorkdayOpen(calendar, 1.5)).toBe(false)
    expect(estateWorkdayOpen(null, 9)).toBe(true)
    expect(estateWorkdayOpen({ day: 'd', settled: 's', lastDay: 9 }, 9)).toBe(true)
    expect(settleWorkday(state, 8, villa, 18, 0)).not.toBeNull()
    expect(settleWorkday(state, 9, villa, 18, 0)).toBeNull()
    expect(settleWorkday(state, 20, villa, 18, 0)).toBeNull()
    expect(actOnEstate(state, { kind: 'restore', key: 'east' }, villa, () => true, 18, 0).rooms).toContain('east')
    expect(actOnEstate(state, { kind: 'settle' }, game, () => true, 18, 0).day).toBe(10)
    expect(estateCalendar(calendar)).toEqual(calendar)
    expect(estateCalendar({ ...calendar, lastWorkday: -1 })).not.toHaveProperty('lastWorkday')
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [villa] })).minigames[0]).toEqual(villa)
  })

  it('round-trips the calendar and a scene gate, and leaves both out when absent', () => {
    const villa = { ...newEstateMinigame('Villa'),
      calendar: { day: 'villa_day', settled: 'villa_settled', when: { variable: 'villa_phase', value: 'evening' }, lastDay: 9 },
      residents: [{ key: 'tamsin', name: 'Tamsin', eligibilityVariable: 'tamsin_arrived', requirement: '', sprite: '',
        scenes: [{ room: 'hall', result: 'villa_tamsin_night', title: 'A door left open', gate: 'tamsin_open' }] }] }
    expect(parseMinigames(serialiseMinigames({ version: 1, minigames: [villa] })).minigames[0]).toEqual(villa)
    const bare = parseMinigames(serialiseMinigames({ version: 1, minigames: [game] })).minigames[0]!
    expect(bare).not.toHaveProperty('calendar')
    expect(bare.kind === 'estate' && bare.residents[0]!.scenes[0]).not.toHaveProperty('gate')
  })

  it('reads only a calendar that names both variables', () => {
    expect(estateCalendar({ day: 'd' })).toBeUndefined()
    expect(estateCalendar({ day: 'd', settled: 's', when: { variable: 'p' }, lastDay: -1 })).toEqual({ day: 'd', settled: 's' })
    expect(estateCalendar({ day: 'd', settled: 's', when: { variable: 'p', value: 'evening' }, lastDay: 9 }))
      .toEqual({ day: 'd', settled: 's', when: { variable: 'p', value: 'evening' }, lastDay: 9 })
  })

  it('pays a workday once, itemised, without moving the day', () => {
    let state = newEstateState(80, game.rooms)
    state = actOnEstate(state, { kind: 'contract', index: 0 }, game, () => true, 18, 0)
    const paid = settleWorkday(state, 3, game, 18, 5)!
    expect(paid).toMatchObject({ stipend: 18, commissions: commissionQuote(3, [0]).pay, bonus: 5 })
    expect(paid.income).toBe(18 + paid.commissions + 5)
    expect(paid.state).toMatchObject({ day: 3, crowns: 80 + paid.income, selected: [], lastIncome: paid.income })
    // An idle board earns the stipend and no bonus.
    const idle = settleWorkday(newEstateState(80, game.rooms), 5, game, 18, 12)!
    expect(idle).toMatchObject({ stipend: 18, commissions: 0, bonus: 0, income: 18 })
  })

  it('refuses a draft the day cannot staff rather than paying for it', () => {
    // Day one's scarce crew is the gardeners, at two; a plan wanting more is void there.
    const villa = { ...game, contracts: [{ name: 'Weeding', needs: [3, 0, 0] as [number, number, number], pay: 20 }] }
    const state = { ...newEstateState(80, game.rooms), selected: [0] }
    expect(settleWorkday(state, 1, villa, 18, 0)).toBeNull()
    expect(settleWorkday(state, 2, villa, 18, 0)?.commissions).toBe(22)
  })
})
