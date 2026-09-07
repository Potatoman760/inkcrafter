// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

import type { GalleryMediaRef } from '../../galleryDoc'
import type { TunableNumber } from '../common'

export interface EstateRoom {
  key: string
  name: string
  cost: number
  beds: number
  /** Primary intended resident. null is non-residential; omitted keeps legacy open suites. */
  residentKey?: string | null
  /** Optional second intended resident; no room houses more than two people. */
  companionKey?: string | null
  /** Invite/depart as one household, after both invitation conditions are met. */
  inviteTogether?: boolean
  /** A shared bathhouse displays invited household guests without moving their homes. */
  sharedBaths?: boolean
  /** Separate water-level backdrop for the Take a bath screen. */
  bathingBackground?: GalleryMediaRef | null
  /** When set, the room exists only as unlabeled scenery unless this Ink boolean is true. */
  availabilityVariable?: string | null
  /** Legacy metadata only. Restoration no longer depends on other rooms. */
  requires: string | null
  description: string
  /** Illustrated interior used when entering this room; optional for older projects. */
  background?: GalleryMediaRef | null
  /** Empty interior shown before restoration; omitted keeps the legacy artwork. */
  unrestoredBackground?: GalleryMediaRef | null
  /** Centre and extent in floorPlanSize pixels, just like map hotspots. */
  bounds?: EstateBounds | null
  startsActive?: boolean
  /** Preserves paired-wing purchases from the original version-one ledger. */
  legacyRestoredBy?: string
}

export interface EstateBounds { x: number; y: number; width: number; height: number }
export const ESTATE_PLAN_SIZE = { width: 1672, height: 941 }

export interface EstateResident {
  key: string
  name: string
  /** A completed relationship flag, read from Ink. */
  eligibilityVariable: string
  requirement: string
  sprite: string
  /** Special still character look for the communal baths. No automatic outfit fallback. */
  bathSprite?: GalleryMediaRef | null
  /** Top percentage of the nontransparent sprite to show above the water. */
  bathVisiblePercent?: number
  /** Result tokens returned to Ink; each room unlocks a separate scene. */
  scenes: EstateScene[]
}

export interface EstateScene {
  room: string
  result: string
  title: string
  /** An Ink boolean that must also be true: her story has to reach the moment before the room can hold it. */
  gate?: string | null
}

/** Story gates apply equally to visible controls and dispatched scene actions. */
export function estateSceneEnabled(scene: EstateScene, read: (variable: string) => boolean): boolean {
  return !scene.gate || read(scene.gate) === true
}

/**
 * A chapter's calendar, when the story rather than the villa owns the day.
 *
 * Standalone, the villa advances its own day on settlement. Under a calendar
 * the day is read from Ink, the work is paid once per calendar day, and only
 * while the phase variable holds the given value — the evening, in a story
 * that pays at dusk. Names of variables, so the engine knows nothing of any
 * one story's knots.
 */
export interface EstateCalendar {
  /** Number variable: the authoritative day. */
  day: string
  /** Number variable: the last day whose crew work was paid. */
  settled: string
  /** Text variable and the value it must hold for work to be paid on entry. Absent: any entry. */
  when?: { variable: string; value: string } | null
  /** The calendar's last day, for the countdown. */
  lastDay?: number | null
  /** Final earning day, inclusive. Later days allow purchases and visits only. */
  lastWorkday?: number | null
}

export function estateWorkdayOpen(calendar: EstateCalendar | null | undefined, day: number): boolean {
  return Number.isSafeInteger(day) && day >= 1 && (calendar?.lastWorkday == null || day <= calendar.lastWorkday)
}

export interface EstateMinigame {
  id: string
  kind: 'estate'
  name: string
  display: string
  description: string
  background: GalleryMediaRef | null
  noticeboardBackground?: GalleryMediaRef | null
  /** Registered empty version of the floor plan, cropped under disabled room areas. */
  disabledFloorPlan?: GalleryMediaRef | null
  floorPlanSize: { width: number; height: number }
  /** The notices on the commission board. Absent means the built-in six. */
  contracts?: EstateContract[]
  /** Present when a story calendar owns the day. */
  calendar?: EstateCalendar | null
  /** Authored guided tour; edited as JSON and carried in the minigame catalogue. */
  tutorial?: EstateTutorial | null
  resultVariable: string
  stateVariable: string
  showStateHints: boolean
  startingFunds: TunableNumber
  dailyStipend: TunableNumber
  commissionBonus: TunableNumber
  rooms: EstateRoom[]
  residents: EstateResident[]
}

/** All progress lives in one Ink text global and follows the normal save slots. */
export interface EstateState {
  version: 2
  day: number
  crowns: number
  rooms: string[]
  residents: string[]
  seen: string[]
  selected: number[]
  lastIncome: number
  /** Resident key → room key. Departures free the specific suite. */
  assignments: Record<string, string>
  /** Script revision completed or skipped. Optional for existing saves. */
  tutorialSeen?: number
}

export const ESTATE_TUTORIAL_TARGETS = ['overview', 'funds', 'noticeboard', 'notices', 'crews', 'income', 'room', 'restore', 'invitation', 'visits', 'return'] as const
export interface EstateTutorialStep {
  title: string
  text: string
  /** Standalone editor testing has its own clock, unlike a story calendar. */
  testText?: string
  page: 'villa' | 'room' | 'commissions'
  target: typeof ESTATE_TUTORIAL_TARGETS[number]
  room?: string
}
export interface EstateTutorial {
  version: number
  autoStart: boolean
  speaker: { name: string; sprite: string; expression?: string }
  steps: EstateTutorialStep[]
}

/** Strict on purpose: raw JSON mistakes must be reported, never silently discarded. */
export function parseEstateTutorial(value: unknown): EstateTutorial | null {
  if (value == null) return null
  const object = (raw: unknown, at: string): Record<string, unknown> => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(at + ' must be an object.')
    return raw as Record<string, unknown>
  }
  const keys = (raw: Record<string, unknown>, allowed: string[], at: string): void => {
    const extra = Object.keys(raw).find(key => !allowed.includes(key))
    if (extra) throw new Error(at + ': unknown field “' + extra + '”.')
  }
  const text = (raw: unknown, at: string, max: number): string => {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > max) throw new Error(at + ' must contain 1–' + max + ' characters.')
    return raw
  }
  const raw = object(value, 'Tutorial')
  keys(raw, ['version', 'autoStart', 'speaker', 'steps'], 'Tutorial')
  if (!Number.isSafeInteger(raw.version) || (raw.version as number) < 1) throw new Error('Tutorial version must be a positive integer.')
  if (typeof raw.autoStart !== 'boolean') throw new Error('Tutorial autoStart must be true or false.')
  const speaker = object(raw.speaker, 'Speaker')
  keys(speaker, ['name', 'sprite', 'expression'], 'Speaker')
  if (!Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > 40) throw new Error('Tutorial needs 1–40 steps.')
  const steps = raw.steps.map((value, i): EstateTutorialStep => {
    const at = 'Step ' + (i + 1), step = object(value, at)
    keys(step, ['title', 'text', 'testText', 'page', 'target', 'room'], at)
    if (!['villa', 'room', 'commissions'].includes(String(step.page))) throw new Error(at + ': page must be villa, room or commissions.')
    if (!ESTATE_TUTORIAL_TARGETS.includes(step.target as EstateTutorialStep['target'])) throw new Error(at + ': unknown target.')
    const target = step.target as EstateTutorialStep['target'], page = step.page as EstateTutorialStep['page']
    if ((['notices', 'crews', 'income'].includes(target) && page !== 'commissions') ||
        (['restore', 'invitation', 'visits'].includes(target) && page !== 'room') ||
        (['overview', 'room'].includes(target) && page !== 'villa')) throw new Error(at + ': target does not belong to this page.')
    if ((page === 'room' || target === 'room') && !step.room) throw new Error(at + ': room is required.')
    return { title: text(step.title, at + ' title', 60), text: text(step.text, at + ' text', 360), page, target,
      ...(step.testText === undefined ? {} : { testText: text(step.testText, at + ' testText', 360) }),
      ...(step.room === undefined ? {} : { room: text(step.room, at + ' room', 100) }) }
  })
  return { version: raw.version as number, autoStart: raw.autoStart,
    speaker: { name: text(speaker.name, 'Speaker name', 40), sprite: text(speaker.sprite, 'Speaker sprite', 100),
      ...(speaker.expression === undefined ? {} : { expression: text(speaker.expression, 'Speaker expression', 100) }) }, steps }
}

export const ESTATE_ROOMS: EstateRoom[] = [
  { key: 'hall', name: 'Reception', cost: 0, beds: 0, requires: null, startsActive: true, description: 'The shared heart of the house.', bounds: { x: 775, y: 448, width: 190, height: 264 } },
  { key: 'suite_1', name: 'Rose suite', cost: 0, beds: 1, requires: 'hall', startsActive: true, description: 'A furnished private bedroom beside the front terrace.', bounds: { x: 308, y: 680, width: 176, height: 160 } },
  { key: 'suite_2', name: 'Sage suite', cost: 0, beds: 1, requires: 'hall', startsActive: true, description: 'A quiet, furnished one-bed suite.', bounds: { x: 305, y: 516, width: 180, height: 132 } },
  { key: 'east', name: 'Blue suite', cost: 30, beds: 1, requires: 'hall', description: 'Restore a private room overlooking the west path.', bounds: { x: 312, y: 370, width: 178, height: 122 } },
  { key: 'east_2', name: 'Violet suite', cost: 30, beds: 1, requires: 'east', legacyRestoredBy: 'east', description: 'A corner bedroom with violet linens.', bounds: { x: 313, y: 221, width: 177, height: 128 } },
  { key: 'garden', name: 'Moon garden', cost: 45, beds: 0, requires: 'hall', description: 'The outdoor garden and fountain beyond the house.', bounds: { x: 1222, y: 822, width: 553, height: 190 } },
  { key: 'west', name: 'Sky suite', cost: 50, beds: 1, requires: 'east_2', description: 'One private bedroom along the northern gallery.', bounds: { x: 691, y: 149, width: 164, height: 154 } },
  { key: 'west_2', name: 'Blush suite', cost: 50, beds: 1, requires: 'west', legacyRestoredBy: 'west', description: 'A warm, intimate northern bedroom.', bounds: { x: 859, y: 147, width: 147, height: 149 } },
  { key: 'baths', name: 'Bath room', cost: 65, beds: 0, requires: 'east_2', description: 'A tiled indoor bathing room, separate from the garden.', bounds: { x: 973, y: 376, width: 185, height: 113 } },
  { key: 'upper', name: 'Olive suite', cost: 70, beds: 1, requires: 'west_2', description: 'A spacious ground-floor corner room.', bounds: { x: 1029, y: 146, width: 163, height: 148 } },
  { key: 'upper_2', name: 'Azure suite', cost: 70, beds: 1, requires: 'upper', legacyRestoredBy: 'upper', description: 'A bright bedroom in the east wing.', bounds: { x: 1321, y: 222, width: 166, height: 126 } },
  { key: 'conservatory', name: 'Conservatory', cost: 85, beds: 0, requires: 'west_2', description: 'A glass-walled sitting room beside the outdoor garden.', bounds: { x: 1195, y: 638, width: 184, height: 130 } },
  { key: 'guest', name: 'Lilac suite', cost: 90, beds: 1, requires: 'upper_2', description: 'A secluded room in the east wing.', bounds: { x: 1324, y: 372, width: 167, height: 116 } },
  { key: 'guest_2', name: 'Teal suite', cost: 90, beds: 1, requires: 'guest', legacyRestoredBy: 'guest', description: 'The final private suite, overlooking the garden.', bounds: { x: 1346, y: 521, width: 191, height: 115 } }
]

export function newEstateState(funds: number, rooms = ESTATE_ROOMS): EstateState {
  return { version: 2, day: 1, crowns: Math.max(0, Math.round(funds)), rooms: rooms.filter(room => room.key === 'hall' || room.startsActive).map(room => room.key), residents: [], seen: [], selected: [], lastIncome: 0, assignments: {} }
}

export function readEstateState(raw: unknown, funds: number, rooms = ESTATE_ROOMS): EstateState {
  if (raw === '' || raw === undefined || raw === null) return newEstateState(funds, rooms)
  // Refuse bad/future saves instead of silently replacing a developed household.
  const value = JSON.parse(String(raw)) as Omit<EstateState, 'version'> & { version: number }
  if (!value || ![1, 2].includes(value.version) || !Number.isSafeInteger(value.day) || value.day < 1 ||
      !Number.isSafeInteger(value.crowns) || value.crowns < 0 ||
      ![value.rooms, value.residents, value.seen].every(list => Array.isArray(list) && list.every(key => typeof key === 'string')) ||
      !Array.isArray(value.selected) || !value.selected.every(n => Number.isInteger(n) && n >= 0 && n < 6)) {
    throw new Error('The villa ledger could not be read. Load an earlier save to recover it.')
  }
  if (value.version === 2 && (!value.assignments || typeof value.assignments !== 'object' || Array.isArray(value.assignments) ||
      !Object.values(value.assignments).every(key => typeof key === 'string'))) throw new Error('The villa room assignments could not be read.')
  const restored = [...value.rooms, ...rooms.filter(room => room.startsActive ||
    (value.version === 1 && room.legacyRestoredBy && value.rooms.includes(room.legacyRestoredBy))).map(room => room.key)]
  return placeEstateResidents({ ...value, version: 2, assignments: value.assignments ?? {}, rooms: [...new Set(restored)], residents: [...new Set(value.residents)], seen: [...new Set(value.seen)], selected: [...new Set(value.selected)] }, rooms)
}

/** Keep valid placements, then house older saves without losing any residents. */
export function placeEstateResidents(state: EstateState, rooms: EstateRoom[]): EstateState {
  // An already invited companion keeps her place when an author dedicates rooms.
  // Grandfather her new home as restored; never charge again or evict an old save.
  const restored = [...new Set([...state.rooms, ...rooms.filter(room => estateRoomMembers(room).some(key =>
    state.residents.includes(key)) && room.beds > 0).map(room => room.key)])]
  const assignments: Record<string, string> = {}
  const remaining: string[] = []
  const available = (key: string, resident: string): boolean => {
    const room = rooms.find(room => room.key === key)
    return !!room && restored.includes(key) && estateRoomAccepts(room, resident, rooms) &&
      Object.values(assignments).filter(one => one === key).length < estateRoomCapacity(room)
  }
  for (const resident of state.residents) {
    const key = state.assignments[resident]
    if (key && available(key, resident)) Object.defineProperty(assignments, resident, { value: key, enumerable: true, configurable: true, writable: true })
    else remaining.push(resident)
  }
  for (const resident of remaining) {
    const room = rooms.find(room => available(room.key, resident))
    if (room) Object.defineProperty(assignments, resident, { value: room.key, enumerable: true, configurable: true, writable: true })
  }
  return { ...state, rooms: restored, assignments }
}

export function estateRoomResidents(state: EstateState, room: string): string[] {
  return state.residents.filter(key => state.assignments[key] === room)
}

export function estateRoomEnabled(room: EstateRoom, read: (variable: string) => boolean): boolean {
  return !room.availabilityVariable || read(room.availabilityVariable) === true
}

/** The same state-based artwork selection is used by room previews and interiors. */
export function estateRoomBackground(room: EstateRoom, state: Pick<EstateState, 'rooms'>): GalleryMediaRef | null {
  return (!state.rooms.includes(room.key) ? room.unrestoredBackground : null) ?? room.background ?? null
}

export function estateRoomCapacity(room: EstateRoom): number {
  return Math.max(0, Math.min(2, room.beds, room.residentKey === null ? 0 : estateRoomMembers(room).length || 2))
}

export function estateRoomMembers(room: EstateRoom): string[] {
  return [...new Set([room.residentKey, room.companionKey].filter((key): key is string => !!key))]
}

export function estateRoomAccepts(room: EstateRoom, resident: string, rooms: EstateRoom[]): boolean {
  if (room.residentKey !== undefined) return estateRoomMembers(room).includes(resident)
  // A resident with a custom home cannot bypass its restoration using a legacy spare suite.
  return !rooms.some(one => estateRoomMembers(one).includes(resident))
}

export function estateInviteGroup(room: EstateRoom, resident: string): string[] {
  return room.inviteTogether ? estateRoomMembers(room) : [resident]
}

/** Visitors are a view of the current household, never extra housing assignments. */
export function estateBathGuests(state: EstateState, config: Pick<EstateMinigame, 'rooms' | 'residents'>,
  roomKey: string, read: (variable: string) => boolean): EstateResident[] {
  const bath = config.rooms.find(room => room.key === roomKey)
  if (!bath?.sharedBaths || !estateRoomEnabled(bath, read) || !state.rooms.includes(roomKey)) return []
  return config.residents.filter(resident => state.residents.includes(resident.key) &&
    config.rooms.some(home => home.key === state.assignments[resident.key] && state.rooms.includes(home.key) && estateRoomEnabled(home, read)))
}

export function estateBathPercent(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(5, value)) : 40
}

/** Ignore transparent margins before applying an author's visible percentage. */
export function estateSpriteBounds(width: number, height: number, rgba: ArrayLike<number>): { x: number; y: number; width: number; height: number } {
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if ((rgba[(y * width + x) * 4 + 3] ?? 0) <= 8) continue
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  return right < 0 ? { x: 0, y: 0, width, height } : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

/** One source of truth for group eligibility, capacity, UI and dispatched actions. */
export function estateInvitationRoom(state: EstateState, config: Pick<EstateMinigame, 'rooms' | 'residents'>,
  key: string, roomKey: string | undefined, eligible: (variable: string) => boolean,
  available: (variable: string) => boolean = eligible): EstateRoom | undefined {
  return config.rooms.find(room => {
    if ((roomKey && room.key !== roomKey) || !estateRoomEnabled(room, available) ||
        !state.rooms.includes(room.key) || !estateRoomAccepts(room, key, config.rooms)) return false
    const group = estateInviteGroup(room, key), missing = group.filter(one => !state.residents.includes(one))
    return missing.length > 0 && group.every(one => {
      const person = config.residents.find(person => person.key === one)
      return !!person && eligible(person.eligibilityVariable) &&
        (!state.residents.includes(one) || state.assignments[one] === room.key)
    }) && missing.length + estateRoomResidents(state, room.key).length <= estateRoomCapacity(room)
  })
}

export function availableEstateRoom(state: EstateState, rooms: EstateRoom[], key?: string, resident?: string, read: (variable: string) => boolean = () => false): EstateRoom | undefined {
  return rooms.find(room => estateRoomEnabled(room, read) && (!key || room.key === key) && state.rooms.includes(room.key) &&
    (resident === undefined || estateRoomAccepts(room, resident, rooms)) && estateRoomResidents(state, room.key).length < estateRoomCapacity(room))
}

export const CREWS = ['Gardeners', 'Builders', 'Stewards'] as const
export type CrewBudget = [number, number, number]
export interface EstateContract { name: string; needs: CrewBudget; pay: number }

/** The most notices the board shows: two rows of three. */
export const ESTATE_CONTRACT_LIMIT = 6
/** The largest any crew is on any day; a notice wanting more can never be pinned. */
export const ESTATE_CREW_LARGEST = 4

export const ESTATE_CONTRACTS: EstateContract[] = [
  { name: 'Herb delivery', needs: [2, 0, 1], pay: 13 },
  { name: 'Bridge repairs', needs: [0, 2, 1], pay: 15 },
  { name: 'Court reception', needs: [1, 0, 2], pay: 14 },
  { name: 'Orchard terraces', needs: [2, 1, 0], pay: 14 },
  { name: 'Market stalls', needs: [0, 1, 2], pay: 15 },
  { name: 'Canal clearing', needs: [1, 2, 0], pay: 13 }
]

/** A rotating market. All prices and requirements are visible before committing. */
export function commissionBoard(day: number, notices: readonly EstateContract[] = ESTATE_CONTRACTS): { crews: CrewBudget; contracts: EstateContract[] } {
  const phase = (day - 1) % 6
  const scarce = phase % 3
  const crews: CrewBudget = [3, 3, 3]
  crews[scarce] = 2
  crews[(scarce + 1) % 3] = ESTATE_CREW_LARGEST
  return {
    crews,
    contracts: notices.map((contract, i) => ({ ...contract, pay: contract.pay + ((i + phase) % 3) * 2 }))
  }
}

export function commissionQuote(day: number, selected: readonly number[], bonus = 0, notices: readonly EstateContract[] = ESTATE_CONTRACTS): {
  valid: boolean; used: CrewBudget; pay: number
} {
  const { crews, contracts } = commissionBoard(day, notices)
  const used: CrewBudget = [0, 0, 0]
  let pay = 0
  if (new Set(selected).size !== selected.length) return { valid: false, used, pay }
  for (const index of selected) {
    const contract = contracts[index]
    if (!Number.isInteger(index) || !contract) return { valid: false, used, pay: 0 }
    contract.needs.forEach((count, i) => { used[i]! += count })
    pay += contract.pay
  }
  return { valid: used.every((count, i) => count <= crews[i]!), used, pay: pay + (selected.length ? Math.max(0, bonus) : 0) }
}

export interface EstateSettlement {
  state: EstateState
  stipend: number
  commissions: number
  bonus: number
  income: number
}

/**
 * Pays one calendar day's work without moving the day.
 *
 * The standalone `settle` action pays and advances; under a calendar the story
 * advances, so this pays for the day it is given and leaves the ledger's day
 * matching it. The parts are returned separately because the evening shows
 * them separately. Null when the pinned plan is not legal for that day — a
 * draft pinned on another day's board can be — so nothing is paid for it.
 */
export function settleWorkday(
  state: EstateState,
  day: number,
  config: Pick<EstateMinigame, 'contracts' | 'calendar'>,
  stipend: number,
  bonus: number
): EstateSettlement | null {
  if (!estateWorkdayOpen(config.calendar, day)) return null
  const quote = commissionQuote(day, state.selected, 0, config.contracts)
  if (!quote.valid) return null
  const paidStipend = Math.max(1, Math.round(stipend))
  const paidBonus = state.selected.length ? Math.max(0, bonus) : 0
  const income = paidStipend + quote.pay + paidBonus
  return {
    state: { ...state, day, crowns: state.crowns + income, selected: [], lastIncome: income },
    stipend: paidStipend,
    commissions: quote.pay,
    bonus: paidBonus,
    income
  }
}

export function estateCapacity(state: EstateState, rooms: EstateRoom[], read: (variable: string) => boolean = () => false): number {
  return rooms.filter(room => estateRoomEnabled(room, read) && state.rooms.includes(room.key)).reduce((sum, room) => sum + estateRoomCapacity(room), 0)
}

export type EstateAction =
  | { kind: 'restore'; key: string }
  | { kind: 'invite'; key: string; room?: string }
  | { kind: 'farewell'; key: string }
  | { kind: 'contract'; index: number }
  | { kind: 'settle' }
  | { kind: 'scene'; result: string }

/** Central rules for mouse, keyboard, controller, and saved state alike. */
export function actOnEstate(
  state: EstateState,
  action: EstateAction,
  config: Pick<EstateMinigame, 'rooms' | 'residents' | 'contracts'>,
  eligible: (variable: string) => boolean,
  stipend: number,
  bonus: number,
  roomAvailable: (variable: string) => boolean = eligible
): EstateState {
  switch (action.kind) {
    case 'restore': {
      const room = config.rooms.find(room => room.key === action.key)
      if (!room || !estateRoomEnabled(room, roomAvailable) || state.rooms.includes(room.key) || state.crowns < room.cost) return state
      return placeEstateResidents({ ...state, crowns: state.crowns - room.cost, rooms: [...state.rooms, room.key] }, config.rooms)
    }
    case 'invite': {
      const room = estateInvitationRoom(state, config, action.key, action.room, eligible, roomAvailable)
      if (!room) return state
      const group = estateInviteGroup(room, action.key)
      return { ...state, residents: [...new Set([...state.residents, ...group])],
        assignments: { ...state.assignments, ...Object.fromEntries(group.map(key => [key, room.key])) } }
    }
    case 'farewell': {
      const room = config.rooms.find(one => one.key === state.assignments[action.key])
      const group = room ? estateInviteGroup(room, action.key) : [action.key]
      return { ...state, residents: state.residents.filter(key => !group.includes(key)), assignments: Object.fromEntries(Object.entries(state.assignments).filter(([key]) => !group.includes(key))) }
    }
    case 'contract': {
      const selected = state.selected.includes(action.index)
        ? state.selected.filter(index => index !== action.index)
        : [...state.selected, action.index]
      return commissionQuote(state.day, selected, 0, config.contracts).valid ? { ...state, selected } : state
    }
    case 'settle': {
      const quote = commissionQuote(state.day, state.selected, bonus, config.contracts)
      if (!quote.valid) return state
      const income = Math.max(1, Math.round(stipend)) + quote.pay
      return { ...state, day: state.day + 1, crowns: state.crowns + income, selected: [], lastIncome: income }
    }
    case 'scene': {
      const resident = config.residents.find(one => one.scenes.some(scene => scene.result === action.result))
      const scene = resident?.scenes.find(one => one.result === action.result)
      const destination = config.rooms.find(room => room.key === scene?.room)
      const home = config.rooms.find(room => room.key === state.assignments[resident?.key ?? ''])
      if (!resident || !scene || !estateSceneEnabled(scene, eligible) || !eligible(resident.eligibilityVariable) ||
          !destination || !estateRoomEnabled(destination, roomAvailable) || !home || !estateRoomEnabled(home, roomAvailable) ||
          !state.residents.includes(resident.key) || !state.rooms.includes(scene.room)) return state
      return { ...state, seen: [...new Set([...state.seen, scene.result])] }
    }
  }
}

/** Parser preserves authored room/resident data; preflight checks references. */
export function estateConfiguration(value: Record<string, unknown>): Pick<EstateMinigame, 'rooms' | 'residents' | 'contracts' | 'calendar' | 'tutorial'> {
  const rooms = Array.isArray(value.rooms) ? value.rooms : ESTATE_ROOMS
  const residents = Array.isArray(value.residents) ? value.residents : []
  const contracts = estateContracts(value.contracts)
  const calendar = estateCalendar(value.calendar)
  // Like other optional catalogue fields, a broken tour must not hide every minigame.
  // The raw-JSON editor uses the strict parser directly and refuses invalid edits.
  let tutorial: EstateTutorial | null = null
  try { tutorial = parseEstateTutorial(value.tutorial) } catch { /* no tour */ }
  return {
    ...(value.tutorial === undefined ? {} : { tutorial }),
    ...(contracts ? { contracts } : {}),
    ...(calendar ? { calendar } : {}),
    rooms: rooms.filter((room): room is EstateRoom => room && typeof room.key === 'string' && typeof room.name === 'string' &&
      Number.isSafeInteger(room.cost) && room.cost >= 0 && Number.isSafeInteger(room.beds) && room.beds >= 0 &&
      (room.requires === null || typeof room.requires === 'string') && typeof room.description === 'string' &&
      (room.bounds == null || validEstateBounds(room.bounds)) &&
      (room.startsActive === undefined || typeof room.startsActive === 'boolean') &&
      (room.availabilityVariable == null || typeof room.availabilityVariable === 'string') &&
      (room.residentKey == null || (typeof room.residentKey === 'string' && room.residentKey.length > 0)) &&
      (room.companionKey == null || (typeof room.companionKey === 'string' && room.companionKey.length > 0)) &&
      (room.inviteTogether === undefined || typeof room.inviteTogether === 'boolean') &&
      (room.sharedBaths === undefined || typeof room.sharedBaths === 'boolean') &&
      (room.legacyRestoredBy === undefined || typeof room.legacyRestoredBy === 'string'))
      .map(room => ({ ...room,
        ...(room.background === undefined ? {} : { background: estateMediaRef(room.background) }),
        ...(room.bathingBackground === undefined ? {} : { bathingBackground: estateMediaRef(room.bathingBackground) }),
        ...(room.unrestoredBackground === undefined ? {} : { unrestoredBackground: estateMediaRef(room.unrestoredBackground) }) })),
    residents: residents.filter((one): one is EstateResident => one && typeof one.key === 'string' && typeof one.name === 'string' &&
      typeof one.eligibilityVariable === 'string' && typeof one.requirement === 'string' && typeof one.sprite === 'string' &&
      Array.isArray(one.scenes) && one.scenes.every((scene: Record<string, unknown>) => scene && typeof scene.room === 'string' &&
        typeof scene.result === 'string' && typeof scene.title === 'string'))
      .map(one => ({ ...one, ...(one.bathVisiblePercent === undefined ? {} : { bathVisiblePercent: estateBathPercent(one.bathVisiblePercent) }), ...(one.bathSprite === undefined ? {} : { bathSprite: estateMediaRef(one.bathSprite) }), scenes: one.scenes.map(scene => typeof scene.gate === 'string' && scene.gate.length > 0
        ? { room: scene.room, result: scene.result, title: scene.title, gate: scene.gate }
        : { room: scene.room, result: scene.result, title: scene.title }) }))
  }
}

/** A story calendar, or undefined for a villa that keeps its own days. */
export function estateCalendar(value: unknown): EstateCalendar | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw.day !== 'string' || !raw.day || typeof raw.settled !== 'string' || !raw.settled) return undefined
  const when = raw.when && typeof raw.when === 'object' ? raw.when as Record<string, unknown> : null
  const lastDay = typeof raw.lastDay === 'number' && Number.isSafeInteger(raw.lastDay) && raw.lastDay > 0 ? raw.lastDay : null
  const lastWorkday = typeof raw.lastWorkday === 'number' && Number.isSafeInteger(raw.lastWorkday) && raw.lastWorkday > 0 ? raw.lastWorkday : null
  return {
    day: raw.day,
    settled: raw.settled,
    ...(when && typeof when.variable === 'string' && when.variable && typeof when.value === 'string'
      ? { when: { variable: when.variable, value: when.value } } : {}),
    ...(lastDay ? { lastDay } : {}),
    ...(lastWorkday ? { lastWorkday } : {})
  }
}

/** Authored notices, or undefined for a project that never wrote any and keeps the built-in board. */
export function estateContracts(value: unknown): EstateContract[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .filter((one): one is EstateContract => !!one && typeof one.name === 'string' && Number.isSafeInteger(one.pay) && one.pay >= 0 &&
      Array.isArray(one.needs) && one.needs.length === 3 && one.needs.every((n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0))
    .map(one => ({ name: one.name, needs: [one.needs[0], one.needs[1], one.needs[2]] as CrewBudget, pay: one.pay }))
    .slice(0, ESTATE_CONTRACT_LIMIT)
}

export function estateMediaRef(value: unknown): GalleryMediaRef | null {
  if (!value || typeof value !== 'object') return null
  const ref = value as GalleryMediaRef
  return typeof ref.assetId === 'string' && ref.assetId.length > 0 &&
    typeof ref.variantId === 'string' && ref.variantId.length > 0
    ? { assetId: ref.assetId, variantId: ref.variantId } : null
}

export function validEstateBounds(value: unknown): value is EstateBounds {
  if (!value || typeof value !== 'object') return false
  const box = value as EstateBounds
  return [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0
}

export function estatePlanSize(value: unknown): { width: number; height: number } {
  const size = value as { width?: number; height?: number } | null
  return size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width! > 0 && size.height! > 0
    ? { width: size.width!, height: size.height! } : { ...ESTATE_PLAN_SIZE }
}
