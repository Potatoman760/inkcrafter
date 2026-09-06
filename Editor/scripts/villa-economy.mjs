// The villa's calendar economy, simulated against the real engine and data.
//
// Answers the handoff's balance questions rather than asserting numbers: every
// legal commission plan per day is enumerated with the actual board, rooms are
// bought in prerequisite order with the actual restore rules, and the scenarios
// — efficient play, one or two modest mistakes, second-best choices, empty
// days, stipend only, zero and maximum stat bonus — are each walked to the
// deadline. Run with --proposed to try the handoff's price table before it is
// written into minigames.json.
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('data/projects/breedhaven')
const proposed = process.argv.includes('--proposed')
const quiet = process.argv.includes('--quiet')

const compiled = await build({
  stdin: {
    contents: "export {actOnEstate,newEstateState,commissionBoard,commissionQuote,ESTATE_CONTRACTS} from './src/shared/bundle/estate';",
    resolveDir: process.cwd(),
    loader: 'ts'
  },
  bundle: true, platform: 'node', format: 'esm', write: false
})
const estate = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const { actOnEstate, newEstateState, commissionBoard, commissionQuote } = estate

const game = JSON.parse(readFileSync(resolve(root, 'minigames.json'), 'utf8')).minigames.find((one) => one.kind === 'estate')

/** The handoff's table: normalised exclusive rooms, and the two staff fit-outs on the guest rooms. */
const PROPOSED = {
  west: { cost: 120 }, west_2: { cost: 120 }, upper: { cost: 120 },
  guest: { cost: 90, startsActive: false, residentKey: 'isolde', beds: 1 },
  guest_2: { cost: 60, startsActive: false, residentKey: 'tamsin', beds: 1 }
}
const rooms = game.rooms.map((room) => proposed && PROPOSED[room.key] ? { ...room, ...PROPOSED[room.key] } : room)
const config = { ...game, rooms }

const START = game.startingFunds.base
const STIPEND = game.dailyStipend.base
const WORKDAYS = 8
const MISTAKE = 20

/** Every legal plan for one day: the pay of each, best first. */
function plans(day, bonus) {
  const { contracts } = commissionBoard(day, game.contracts)
  const out = []
  for (let mask = 0; mask < 1 << contracts.length; mask += 1) {
    const chosen = contracts.map((_, i) => i).filter((i) => mask & (1 << i))
    const quote = commissionQuote(day, chosen, bonus, game.contracts)
    if (quote.valid) out.push({ chosen, pay: quote.pay })
  }
  return out.sort((a, b) => b.pay - a.pay)
}

/** What a day pays under a policy: 'best', 'second', 'empty', or a crown shortfall from best. */
function dayIncome(day, bonus, policy) {
  const all = plans(day, bonus)
  const best = all[0].pay
  if (policy === 'empty') return STIPEND
  if (policy === 'second') {
    const next = all.find((one) => one.pay < best)
    return STIPEND + (next ? next.pay : best)
  }
  if (typeof policy === 'number') {
    // The most a sensible plan can lose: the best plan not worse than the allowance.
    const worse = all.filter((one) => one.pay >= best - policy)
    return STIPEND + worse[worse.length - 1].pay
  }
  return STIPEND + best
}

/** Cheapest-first among what is buyable now: maximises the rooms restored, and the chain is cheap anyway. */
function buyWhatYouCan(state, read) {
  let bought = true
  while (bought) {
    bought = false
    const candidates = config.rooms
      .filter((room) => !state.rooms.includes(room.key) && (!room.availabilityVariable || read(room.availabilityVariable)))
      .filter((room) => !room.requires || state.rooms.includes(room.requires))
      .sort((a, b) => a.cost - b.cost)
    for (const room of candidates) {
      const next = actOnEstate(state, { kind: 'restore', key: room.key }, config, () => true, STIPEND, 0, read)
      if (next !== state) { state = next; bought = true; break }
    }
  }
  return state
}

function eligibleRooms(read) {
  return config.rooms.filter((room) => !room.startsActive && room.key !== 'hall' && (!room.availabilityVariable || read(room.availabilityVariable)))
}

/** Walk eight workdays: earn at evening, then buy in the same evening. */
function run(route, bonus, policies) {
  const read = (variable) => variable === route + '_complete'
  let state = newEstateState(START, config.rooms)
  let earned = 0
  for (let day = 1; day <= WORKDAYS; day += 1) {
    const income = dayIncome(day, bonus, policies[day - 1] ?? 'best')
    earned += income
    state = { ...state, crowns: state.crowns + income, day: day + 1 }
    state = buyWhatYouCan(state, read)
  }
  const wanted = eligibleRooms(read)
  const missing = wanted.filter((room) => !state.rooms.includes(room.key))
  return { earned, funds: START + earned, cost: wanted.reduce((sum, room) => sum + room.cost, 0), missing, left: state.crowns }
}

const routes = ['faye', 'dinah', 'yelena', 'none']
const failures = []
const check = (ok, message) => { if (!ok) failures.push(message) }

const lines = []
lines.push(`Board: ${plans(1, 0).length} legal plans on day 1; best daily pay (stipend included), days 1–8: ${Array.from({ length: WORKDAYS }, (_, i) => dayIncome(i + 1, 0, 'best')).join(', ')}`)
lines.push(`Second-best daily: ${Array.from({ length: WORKDAYS }, (_, i) => dayIncome(i + 1, 0, 'second')).join(', ')}`)

for (const route of routes) {
  const read = (variable) => variable === route + '_complete'
  const cost = eligibleRooms(read).reduce((sum, room) => sum + room.cost, 0)
  const best = run(route, 0, [])
  lines.push(`\n${route.padEnd(6)} eligible ${eligibleRooms(read).length} rooms costing ${cost}; efficient zero-bonus funds ${best.funds} → ${best.missing.length ? 'MISSING ' + best.missing.map((r) => r.name).join(', ') : 'complete'}, ${best.left} left`)
  check(best.missing.length === 0, `${route}: efficient play leaves ${best.missing.map((r) => r.name).join(', ')}`)

  // One and two modest mistakes, on every day and day pair, and the real second-best choice.
  let worstOne = 0, worstTwo = 0, worstSecond = 0
  for (let a = 1; a <= WORKDAYS; a += 1) {
    const one = run(route, 0, Object.assign([], { [a - 1]: MISTAKE }))
    worstOne = Math.max(worstOne, one.missing.length)
    const second = run(route, 0, Object.assign([], { [a - 1]: 'second' }))
    worstSecond = Math.max(worstSecond, second.missing.length)
    for (let b = a + 1; b <= WORKDAYS; b += 1) {
      const two = run(route, 0, Object.assign([], { [a - 1]: MISTAKE, [b - 1]: MISTAKE }))
      worstTwo = Math.max(worstTwo, two.missing.length)
      const twoSecond = run(route, 0, Object.assign([], { [a - 1]: 'second', [b - 1]: 'second' }))
      worstSecond = Math.max(worstSecond, twoSecond.missing.length)
    }
  }
  lines.push(`       worst rooms unfinished — one −${MISTAKE} day: ${worstOne}; two −${MISTAKE} days: ${worstTwo}; one or two second-best days: ${worstSecond}`)
  check(worstOne <= 1, `${route}: one modest mistake leaves ${worstOne} rooms`)
  check(worstTwo <= 1, `${route}: two modest mistakes leave ${worstTwo} rooms`)
  check(worstSecond <= 1, `${route}: second-best choices leave ${worstSecond} rooms`)

  const empty = run(route, 0, Object.assign([], { 3: 'empty' }))
  const stipendOnly = run(route, 0, Array(WORKDAYS).fill('empty'))
  lines.push(`       one empty day: ${empty.missing.length} unfinished; stipend only: ${stipendOnly.missing.length} unfinished, ${stipendOnly.funds} crowns`)

  const max = run(route, 12, [])
  const maxTwo = run(route, 12, Object.assign([], { 0: MISTAKE, 4: MISTAKE }))
  lines.push(`       at the 12-crown bonus cap: ${max.funds} crowns, complete with ${max.left} left; two mistakes still ${maxTwo.missing.length ? 'miss ' + maxTwo.missing.length : 'complete'}`)
  check(max.missing.length === 0, `${route}: bonus play incomplete`)
}

// A route's exclusive choice must not change the difficulty.
const totals = ['faye', 'dinah', 'yelena'].map((route) => eligibleRooms((v) => v === route + '_complete').reduce((sum, room) => sum + room.cost, 0))
check(new Set(totals).size === 1, `exclusive routes cost differently: ${totals.join(', ')}`)

// Prerequisite ordering: the greedy walk above bought in chain order, so a
// complete result already proves every chain is reachable in time.

if (!quiet) console.log(lines.join('\n'))
if (failures.length) {
  console.error('\nBALANCE FAILURES\n' + failures.map((f) => ' - ' + f).join('\n'))
  process.exit(1)
}
console.log(`\nEconomy ${proposed ? '(proposed table) ' : ''}holds: every supported route completes with efficient zero-bonus play, and one or two modest mistakes leave at most one room.`)
