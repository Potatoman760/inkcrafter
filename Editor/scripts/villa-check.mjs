// Compile the actual story and probe the villa: its handoff, every authored
// scene, the household, and the Chapter 5 calendar walked end to end.
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import assert from 'node:assert/strict'
import { Compiler } from 'inkjs/full'

const root = resolve('data/projects/breedhaven')
const compiled = await build({ stdin: { contents: "export {renderStateInk} from './src/shared/statsInk'; export {actOnEstate,newEstateState,estateCapacity,settleWorkday,commissionQuote} from './src/shared/bundle/estate';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false })
const { renderStateInk, actOnEstate, newEstateState, estateCapacity, settleWorkday, commissionQuote } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const stats = JSON.parse(readFileSync(resolve(root, 'stats.json'), 'utf8'))
const npcs = JSON.parse(readFileSync(resolve(root, 'npcs.json'), 'utf8'))
// Generated declarations, rebuilt from their authored catalogues.
assert.equal(readFileSync(resolve(root, 'ink/state.ink'), 'utf8').replace(/\r\n/g, '\n'), renderStateInk(stats, npcs).replace(/\r\n/g, '\n'), 'Regenerate stale state declarations before checking the story')
const main = resolve(root, 'ink/main.ink')
const errors = []
const compile = () => {
  const compiler = new Compiler(readFileSync(main, 'utf8'), {
    sourceFilename: main, countAllVisits: true,
    fileHandler: { ResolveInkFilename: name => resolve(dirname(main), name), LoadInkFileContents: name => readFileSync(name, 'utf8') },
    errorHandler: (message, severity) => { if (severity === 2) errors.push(message) }
  })
  const story = compiler.Compile()
  assert.ok(story, errors.join('\n'))
  assert.equal(errors.length, 0, errors.join('\n'))
  return story
}
const story = compile()
const game = JSON.parse(readFileSync(resolve(root, 'minigames.json'), 'utf8')).minigames.find(game => game.kind === 'estate')
assert.ok(game)
const media = JSON.parse(readFileSync(resolve(root, 'media.json'), 'utf8'))

// --- art: every room and the board distinct, every restorable room with an empty state ---
const pictures = [...game.rooms.map(room => room.background), game.noticeboardBackground]
assert.equal(pictures.length, game.rooms.length + 1)
assert.equal(new Set(pictures.map(ref => ref.variantId)).size, pictures.length, 'Every room and the notice board must have distinct art')
const restorable = game.rooms.filter(room => !room.startsActive && room.key !== 'hall')
assert.ok(restorable.every(room => room.unrestoredBackground), 'Every restorable room needs empty art')
const bedroomArt = game.rooms.find(room => room.key === 'east').unrestoredBackground.variantId
for (const room of restorable.filter(room => !['garden', 'baths', 'conservatory', 'guest', 'guest_2'].includes(room.key))) assert.equal(room.unrestoredBackground.variantId, bedroomArt, room.name)
for (const ref of [...pictures, ...restorable.map(room => room.unrestoredBackground), game.background, game.disabledFloorPlan]) {
  const asset = media.assets.find(asset => asset.id === ref.assetId)
  const look = asset?.variants.find(look => look.id === ref.variantId)
  assert.equal(asset?.kind, 'background')
  assert.ok(look?.file.endsWith('.png'))
  assert.ok(readFileSync(resolve(root, 'media', look.file)).length > 1000)
}
for (const resident of game.residents) {
  if (!resident.sprite) { assert.equal(resident.key, 'piri', 'Only Piri intentionally has no portrait'); continue }
  const sprite = media.assets.find(asset => asset.kind === 'character' && asset.name === resident.sprite)
  assert.ok(sprite?.variants.some(look => look.name === 'neutral'), `${resident.name} needs a neutral sprite`)
}

// --- household: one exclusive home each, and no wrong-room invitation --------
const all = game.rooms.reduce((sum, room) => sum + room.cost, 0)
let household = newEstateState(all, game.rooms)
for (const room of game.rooms) household = actOnEstate(household, { kind: 'restore', key: room.key }, game, () => true, 18, 0)
assert.equal(estateCapacity(household, game.rooms, () => true), game.residents.length)
const exclusive = ['faye', 'dinah', 'yelena']
for (const route of [...exclusive, 'none']) {
  const read = variable => variable === route + '_complete'
  let branch = newEstateState(all, game.rooms)
  for (const room of game.rooms) branch = actOnEstate(branch, { kind: 'restore', key: room.key }, game, () => true, 18, 0, read)
  for (const room of game.rooms) assert.equal(branch.rooms.includes(room.key), !room.availabilityVariable || read(room.availabilityVariable), route + ': ' + room.name)
  assert.equal(estateCapacity(branch, game.rooms, read), game.residents.length - (route === 'none' ? 3 : 2))
  for (const resident of game.residents.filter(one => exclusive.includes(one.key))) {
    const next = actOnEstate(branch, { kind: 'invite', key: resident.key }, game, () => true, 18, 0, read)
    assert.equal(next !== branch, resident.key === route)
  }
}
for (const resident of game.residents) {
  const homes = game.rooms.filter(room => room.residentKey === resident.key || room.companionKey === resident.key)
  assert.equal(homes.length, 1, resident.name)
  for (const other of game.rooms.filter(room => room.key !== homes[0].key)) {
    assert.equal(actOnEstate(household, { kind: 'invite', key: resident.key, room: other.key }, game, () => true, 18, 0), household, `${resident.name} must not enter ${other.name}`)
  }
  household = actOnEstate(household, { kind: 'invite', key: resident.key }, game, () => true, 18, 0)
  assert.equal(household.assignments[resident.key], homes[0].key)
}
// The two exclusive-room prices are equal, and the staff rooms are the old guest rooms.
assert.equal(new Set(exclusive.map(key => game.rooms.find(room => room.residentKey === key).cost)).size, 1)
assert.equal(game.rooms.find(room => room.key === 'guest').residentKey, 'isolde')
assert.equal(game.rooms.find(room => room.key === 'guest_2').residentKey, 'tamsin')
assert.deepEqual(game.calendar, { day: 'villa_day', settled: 'villa_settled', when: { variable: 'villa_phase', value: 'evening' }, lastDay: 9, lastWorkday: 8 })

// --- every scene the villa can open, reached through the dispatch ------------
function drainStory(run) {
  let text = ''
  while (run.canContinue) {
    text += run.Continue()
    for (const tag of run.currentTags) {
      const match = /^npc:\s+(\w+)\s+(\w+)\s+([+-]\d+)$/.exec(tag)
      if (!match) continue
      const [, npc, key, delta] = match
      const field = npcs.npcs.find(one => one.inkId === npc)?.variables.find(one => one.key === key)
      assert.equal(field?.kind, 'number', tag)
      const variable = `${npc}_${key}`
      run.variablesState[variable] = Math.max(field.min, Math.min(field.max, run.variablesState[variable] + Number(delta)))
    }
  }
  return text
}
const drain = () => drainStory(story)
const choose = (pattern) => {
  const index = story.currentChoices.findIndex(choice => pattern.test(choice.text))
  assert.ok(index >= 0, `no choice matching ${pattern}; had: ${story.currentChoices.map(c => c.text).join(' | ')}`)
  story.ChooseChoiceIndex(index)
}
story.variablesState.villa_day = 3
story.variablesState.villa_phase = 'evening'
for (const resident of game.residents) {
  story.variablesState[resident.eligibilityVariable] = true
  for (const scene of resident.scenes) {
    if (scene.gate) story.variablesState[scene.gate] = true
    story.variablesState.villa_result = scene.result
    story.ChoosePathString('villa_dispatch')
    const text = drain()
    assert.ok(text.includes(resident.name), scene.result)
    assert.equal(story.currentChoices[0]?.text, 'Return to the villa', scene.result)
    choose(/Return to the villa/)
    drain()
    assert.ok(story.currentChoices.some(choice => /Sleep/.test(choice.text)), `${scene.result} should return to the evening`)
  }
}
story.variablesState.villa_result = 'return'
story.ChoosePathString('villa_dispatch')
drain()
assert.ok(story.currentChoices.some(choice => /Manage the villa/.test(choice.text)))

// --- the calendar, walked for every route and shared-court answer ------------
// The villa's settlement runs in the player, not in ink; the walk stands in for
// it by paying the settled day the way the player would.
function walk({ ally, love, answer }) {
  const run = compile()
  const set = (name, value) => { run.variablesState[name] = value }
  set('trial_ally', ally); set('seraphine_relationship', love ? 'love' : 'compact')
  for (const key of exclusive) set(key + '_complete', key === ally)
  set('tink_is_bred', ally === 'tink'); set('maren_is_bred', true)
  const go = () => drainStory(run)
  const pick = (pattern) => {
    const index = run.currentChoices.findIndex(choice => pattern.test(choice.text))
    assert.ok(index >= 0, `${ally}/${answer}: no choice ${pattern}; day ${run.variablesState.villa_day}: ${run.currentChoices.map(c => c.text).join(' | ')}`)
    run.ChooseChoiceIndex(index)
    return go()
  }
  const taken = []
  run.ChoosePathString('shared_court')
  let text = go()
  if (love) {
    text += pick(answer === 'separate' ? /Keep the relationships separate/ : answer === 'defer' ? /Ask for time/ : /Propose a shared bond/)
    if (answer === 'share') text += pick(/./)   // the first accepting answer in the companion's negotiation
    // A proposal that lands in bonding right away would be the old, unspread flow.
    assert.ok(!/next afternoon.*\n[\s\S]*Three Queens|First lesson/.test(text), `${ally}: the bond's afternoon must wait for a calendar day`)
  }
  assert.equal(run.variablesState.villa_day, 1, `${ally}/${answer}: the handover sets day 1`)
  assert.ok(run.variablesState.tamsin_arrived && run.variablesState.isolde_arrived)
  assert.ok(run.currentChoices.some(choice => /Set out for the day/.test(choice.text)), `${ally}/${answer}: day 1 morning`)
  let evenings = 0, paid = 0
  for (let day = 1; day <= 8; day += 1) {
    assert.equal(run.variablesState.villa_day, day)
    assert.equal(run.variablesState.villa_phase, 'morning')
    // The fifth morning's letter asks a question before the day can start.
    if (!run.currentChoices.some(choice => /Set out for the day/.test(choice.text))) pick(/Ask Isolde what she would send/)
    pick(/Set out for the day/)
    // The most story-bearing activity first, so every arc is exercised within the eight days.
    const order = [/What Tamsin asked for/, /What Isolde has not said/, /afternoon in the courtyard/, /Answer the guild/, /Help Tamsin/, /Walk the Noble Quarter/, /afternoon Seraphine asked/, /Give Seraphine an answer/, /A day with Seraphine/]
    const chosen = order.find(pattern => run.currentChoices.some(choice => pattern.test(choice.text)))
    taken.push(run.currentChoices.find(choice => chosen.test(choice.text)).text)
    text = pick(chosen)
    if (/Give Seraphine an answer/.test(taken[taken.length - 1])) text += pick(/Propose a shared bond/)
    // An activity with choices of its own is played through: the shared scenes
    // have sticky position choices and one that ends them, so that one first.
    for (let step = 0; step < 12 && run.currentChoices.length && !run.currentChoices.some(choice => /Close the ledger/.test(choice.text)); step += 1) {
      const prefer = [/Fill Tink|Finish with Seraphine|^Cum$/, /Tell her you want her|Tell her it is not unwelcome/, /Keep Tink untitled|Offer Faye|Give Dinah|Accept Yelena|^(?!Ask|Offer .* standing|Not yet)/, /./]
      text += pick(prefer.find(pattern => run.currentChoices.some(choice => pattern.test(choice.text))))
    }
    // Every daytime path ends at the villa, at dusk, on the ledger.
    assert.equal(run.variablesState.villa_phase, 'evening', `${ally}/${answer} day ${day}: ${taken[taken.length - 1]} did not reach the evening; phase ${run.variablesState.villa_phase}; choices ${run.currentChoices.map(c => c.text).join(' | ')}; tail: ${text.slice(-300).split(String.fromCharCode(10)).join(' / ')}`)
    assert.ok(run.currentTags.includes('minigame: consort_villa'), `${ally}/${answer} day ${day}: the evening opens the ledger`)
    evenings += 1
    // Stand in for the player: pay the day once, and never twice on a reload.
    if (run.variablesState.villa_settled < day) { paid += 1; set('villa_settled', day) }
    if (run.variablesState.villa_settled < day) paid += 1
    set('villa_result', 'return')
    pick(/Close the ledger/)
    assert.ok(run.currentChoices.some(choice => /Sleep/.test(choice.text)), `${ally}/${answer} day ${day}: evening hub`)
    pick(/Sleep/)
  }
  assert.equal(run.variablesState.villa_day, 9)
  assert.equal(paid, 8, `${ally}/${answer}: eight payouts, not ${paid}`)
  assert.equal(evenings, 8)
  assert.ok(run.currentChoices.some(choice => /Receive the court/.test(choice.text)))
  pick(/Manage the villa/); set('villa_result', 'return'); pick(/Close the ledger/)
  assert.ok(run.currentChoices.some(choice => /Receive the court/.test(choice.text)), 'day 9 keeps the villa open without a ninth payout')
  assert.equal(run.variablesState.villa_settled, 8)
  text = pick(/Receive the court/)
  assert.ok(/council/.test(text) && run.variablesState.chapter5_complete, `${ally}/${answer}: the epilogue`)
  // NPC tags are applied during the walk, including the Day 5 trust bonus.
  assert.ok(run.variablesState.tamsin_trust >= 2 && run.variablesState.isolde_trust >= 2, `${ally}/${answer}: both staff arcs complete in eight days (${taken.join(' | ')})`)
  assert.ok(run.variablesState.tamsin_open && run.variablesState.isolde_open)
  // The walk takes each negotiation's first answer, which accepts for some companions and not others; either way the afternoon follows acceptance exactly.
  assert.equal(!!run.variablesState.villa_shared_bonded, run.variablesState.shared_relationship === 'accepted', `${ally}/${answer}: the bond's afternoon follows acceptance`)
  return { taken, accepted: run.variablesState.shared_relationship === 'accepted' }
}
const routes = []
for (const ally of ['tink', 'faye', 'dinah', 'yelena']) {
  walk({ ally, love: false, answer: 'none' })
  for (const answer of ['separate', 'defer', 'share']) routes.push(walk({ ally, love: true, answer }))
}

// --- the once-only guard the player uses ---------------------------------------
let ledger = newEstateState(80, game.rooms)
ledger = actOnEstate(ledger, { kind: 'contract', index: 0 }, game, () => true, 18, 0)
const first = settleWorkday(ledger, 1, game, 18, 0)
assert.equal(first.state.crowns, 80 + 18 + commissionQuote(1, [0], 0, game.contracts).pay)
assert.equal(first.state.day, 1, 'settlement never moves the day')

assert.ok(routes.some(route => route.accepted), 'at least one walk exercises the accepted bond and its afternoon')
console.log(`Villa probe passed: ${game.residents.length} exclusive homes, every wrong-room invitation rejected, ${game.residents.reduce((n, r) => n + r.scenes.length, 0)} scenes, ${routes.length + 4} calendar walks to the epilogue with eight payouts each, both staff arcs complete with NPC tags applied. No project files changed.`)
