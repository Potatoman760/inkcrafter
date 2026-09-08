// Read-only regressions using the real story, NPC manager and EstateScene methods.
// Phaser drawing is stubbed; this complements, not replaces, a live player check.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { transformSync } from 'esbuild'
import { Compiler, Story } from 'inkjs/full'

const root = resolve('data/projects/breedhaven')
const main = resolve(root, 'ink/main.ink')
const source = new Compiler(readFileSync(main, 'utf8'), {
  sourceFilename: main, countAllVisits: true,
  fileHandler: { ResolveInkFilename: name => resolve(dirname(main), name), LoadInkFileContents: name => readFileSync(name, 'utf8') }
}).Compile().ToJson()
const game = JSON.parse(readFileSync(resolve(root, 'minigames.json'), 'utf8')).minigames.find(one => one.name === 'consort_villa')
const npcs = JSON.parse(readFileSync(resolve(root, 'npcs.json'), 'utf8')).npcs

function loadTs(file, imports = {}) {
  const code = transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, console, Map, Set, JSON, structuredClone,
    require: name => { if (name in imports) return imports[name]; throw new Error(`Unexpected import: ${name}`) } }, { filename: file })
  return module.exports
}
const { NpcManager } = loadTs('../Player/src/state/NpcManager.ts', { '@/state/npcs': { npcVar: (id, key) => `${id}_${key}` } })
const estate = loadTs('src/shared/bundle/minigame/estate/estate.ts')
const { EstateMemories } = loadTs('../Player/src/minigame/estate/EstateMemories.ts')
const { EstateScene } = loadTs('../Player/src/minigame/estate/EstateScene.ts', {
  phaser: { Scene: class {} }, '@/config/gameConfig': { SceneKey: { Estate: 'Estate', Replay: 'Replay' } },
  '@/state/registry': {}, '@/bundle/registry': {}, '@/bundle/spec/bundle/minigameDoc': {},
  '@/bundle/spec/bundle/estate': estate, '@/input/FocusNavigation': {}, '@/minigame/estate/EstateUI': {},
  '@/state/GameState': { GameState: class {} }, '@/minigame/estate/EstateMemories': { EstateMemories }
})
function session(saved) {
  const story = new Story(source)
  if (saved) story.state.LoadJson(saved)
  const engine = { getVariable: key => story.variablesState[key], setVariable: (key, value) => { story.variablesState[key] = value } }
  const npc = new NpcManager(engine, npcs)
  const drain = () => {
    while (story.canContinue) {
      story.Continue()
      for (const tag of story.currentTags) {
        const match = /^npc:\s+(\w+)\s+(\w+)\s+([+-]\d+)$/.exec(tag)
        if (match) npc.modifyStat(match[1], match[2], Number(match[3]))
      }
    }
  }
  const go = knot => { story.ChoosePathString(knot); drain() }
  const pick = pattern => {
    const choice = story.currentChoices.find(one => pattern.test(one.text))
    assert.ok(choice, `Missing ${pattern}: ${story.currentChoices.map(one => one.text).join(' | ')}`)
    story.ChooseChoiceIndex(choice.index); drain()
  }
  return { story, engine, go, pick }
}

// Complete early scenes, ask advice on Day 5, reload, finish either relationship.
for (const romance of [true, false]) {
  let run = session()
  const set = (key, value) => run.engine.setVariable(key, value)
  set('isolde_arrived', true); set('villa_day', 1)
  run.go('villa_daytime'); run.pick(/Walk the Noble Quarter/)
  assert.deepEqual(run.story.currentChoices.map(choice => choice.text), ['Close the ledger'], 'The guild letter is a continuous scene')
  assert.equal(run.engine.getVariable('isolde_trust'), 1)
  set('villa_day', 3); run.go('villa_daytime'); run.pick(/Answer the guild/)
  run.pick(romance ? /Accept her private invitation/ : /Keep the relationship friendly/)
  assert.equal(run.engine.getVariable('isolde_trust'), 2)
  set('villa_day', 5); set('villa_phase', 'morning'); set('villa_morning_seen', 4)
  run.go('villa_morning'); run.pick(/Ask Isolde what she would send/)
  assert.equal(run.engine.getVariable('isolde_trust'), 3)
  run = session(run.story.state.ToJson())
  if (romance) run.go('villa_isolde_night')
  set('villa_day', 6); run.go('villa_daytime'); run.pick(/An afternoon with Isolde/)
  if (romance) run.pick(/Make time for an ongoing romance/)
  assert.equal(run.engine.getVariable('isolde_open'), romance)
  assert.equal(run.engine.getVariable('isolde_settled'), romance)
  run.go('villa_daytime')
  assert.ok(!run.story.currentChoices.some(one => /An afternoon with Isolde/.test(one.text)))
}

// Day 5 advice must survive either early scene, including after a reload.
for (const completedStages of [0, 1]) {
  let run = session()
  run.engine.setVariable('isolde_arrived', true)
  run.engine.setVariable('villa_day', 1)
  if (completedStages === 1) run.go('isolde_first')
  run.engine.setVariable('villa_day', 5)
  run.engine.setVariable('villa_morning_seen', 4)
  run.go('villa_morning'); run.pick(/Ask Isolde what she would send/)
  assert.equal(run.engine.getVariable('isolde_trust'), completedStages + 1)
  run = session(run.story.state.ToJson())
  if (completedStages === 0) {
    run.go('isolde_first')
    assert.equal(run.engine.getVariable('isolde_trust'), 2, 'First scene preserves the advice gain')
  }
  run.go('isolde_second')
  run.pick(/Keep the relationship friendly/)
  assert.equal(run.engine.getVariable('isolde_trust'), 3, 'Second scene preserves the advice gain')
}

// The second beat decides romance; the third follows the first private encounter.
for (const romance of [true, false]) {
  let run = session()
  run.engine.setVariable('tamsin_arrived', true)
  run.engine.setVariable('villa_day', 1)
  run.go('villa_daytime'); run.pick(/Help Tamsin/)
  assert.equal(run.engine.getVariable('tamsin_trust'), 1)
  run.engine.setVariable('villa_day', 3)
  run.go('villa_daytime'); run.pick(/afternoon in the courtyard/)
  run.pick(romance ? /Ask to spend an evening alone/ : /Tell her you want to remain friends/)
  assert.equal(run.engine.getVariable('tamsin_trust'), 2)
  run = session(run.story.state.ToJson())
  run.engine.setVariable('villa_day', 6)
  run.go('villa_daytime')
  assert.equal(run.story.currentChoices.some(choice => /An afternoon with Tamsin/.test(choice.text)), !romance)
  if (romance) run.go('villa_tamsin_ordinary')
  run.go('villa_daytime'); run.pick(/An afternoon with Tamsin/)
  if (romance) run.pick(/Tell her you want to keep seeing her/)
  assert.equal(run.engine.getVariable('tamsin_bond'), romance ? 'romance' : 'friend')
  assert.equal(run.engine.getVariable('tamsin_open'), romance)
  assert.equal(run.engine.getVariable('tamsin_settled'), romance)
  assert.equal(run.engine.getVariable('tamsin_trust'), 3)
  run.go('villa_daytime')
  assert.ok(!run.story.currentChoices.some(choice => /Help Tamsin|afternoon in the courtyard|An afternoon with Tamsin/.test(choice.text)))
}
// The retained letter choices produce different lasting relationship values.
// A third-beat breakup closes both private visits; initial rejection never opens them.
for (const [who, first, accept, continueLabel, endLabel] of [
  ['tamsin', 'villa_tamsin_ordinary', /Ask to spend an evening alone/, /Tell her you want to keep seeing her/, /Tell her you cannot continue/],
  ['isolde', 'villa_isolde_night', /Accept her private invitation/, /Make time for an ongoing romance/, /End the romance/]
]) {
  const run = session()
  run.engine.setVariable('villa_day', 3)
  run.go(`${who}_first`)
  run.go(`${who}_second`); run.pick(accept)
  assert.equal(run.engine.getVariable(`${who}_open`), true)
  assert.equal(run.engine.getVariable(`${who}_settled`), false)
  run.engine.setVariable('villa_day', 6)
  run.go('villa_daytime')
  const label = new RegExp(`An afternoon with ${who === 'tamsin' ? 'Tamsin' : 'Isolde'}`)
  assert.ok(!run.story.currentChoices.some(choice => label.test(choice.text)), 'Third romance beat waits for the first encounter')
  run.go(`${who}_third`)
  assert.equal(run.story.state.VisitCountAtPathString(`${who}_third_after`), 0, 'A direct visit cannot complete the third beat early')
  run.go(first)
  const resumed = session(run.story.state.ToJson())
  resumed.go('villa_daytime'); resumed.pick(label)
  assert.ok(resumed.story.currentChoices.some(choice => continueLabel.test(choice.text)))
  resumed.pick(endLabel)
  assert.equal(resumed.engine.getVariable(`${who}_bond`), 'friend')
  assert.equal(resumed.engine.getVariable(`${who}_open`), false)
  assert.equal(resumed.engine.getVariable(`${who}_settled`), false)
  assert.equal(resumed.engine.getVariable(`${who}_trust`), 3)
}

for (const [answer, isoldeTrust, seraphineTrust] of [
  [/Give them the rooms and nothing else/, 0, 0],
  [/Give them the whole list/, 0, 1],
  [/Ask Isolde what she would send/, 1, 0]
]) {
  const run = session()
  run.engine.setVariable('villa_day', 5)
  run.engine.setVariable('villa_morning_seen', 4)
  run.engine.setVariable('isolde_trust', 0)
  run.engine.setVariable('seraphine_trust', 0)
  run.go('villa_morning'); run.pick(answer)
  assert.equal(run.engine.getVariable('isolde_trust'), isoldeTrust)
  assert.equal(run.engine.getVariable('seraphine_trust'), seraphineTrust)
}
const early = session()
early.engine.setVariable('isolde_arrived', true); early.engine.setVariable('villa_day', 6); early.engine.setVariable('isolde_trust', 3)
early.go('villa_daytime')
assert.ok(early.story.currentChoices.some(one => /Walk the Noble Quarter/.test(one.text)))
assert.ok(!early.story.currentChoices.some(one => /Answer the guild|What Isolde/.test(one.text)))

function player(run, ledger) {
  const view = new EstateScene()
  Object.assign(view, { calendar: game.calendar, ledger, definition: game, state: { engine: run.engine },
    launchData: { mode: 'story' }, stipend: 18, bonus: 0 })
  view.render = () => {}
  return view
}
const run = session()
run.engine.setVariable('villa_day', 8); run.engine.setVariable('villa_phase', 'evening'); run.engine.setVariable('villa_settled', 7)
const board = player(run, { ...estate.newEstateState(1000, game.rooms), day: 8, selected: [0] })
board.settleIfDue()
const paid = board.ledger.crowns
board.settleIfDue(); assert.equal(board.ledger.crowns, paid)
const reloaded = session(run.story.state.ToJson())
const restored = player(reloaded, estate.readEstateState(reloaded.engine.getVariable(game.stateVariable), 80, game.rooms))
restored.settleIfDue(); assert.equal(restored.ledger.crowns, paid)
reloaded.engine.setVariable('villa_day', 9); restored.ledger.day = 9
reloaded.engine.setVariable('villa_phase', 'morning')
assert.equal(restored.boardLocked(), false)
restored.settleIfDue(); assert.equal(restored.ledger.crowns, paid)
restored.act({ kind: 'contract', index: 0 }); assert.equal(restored.ledger.selected.length, 1)
reloaded.engine.setVariable('villa_phase', 'evening')
restored.settleIfDue(); assert.ok(restored.ledger.crowns > paid)
const ninthPaid = restored.ledger.crowns
restored.settleIfDue(); assert.equal(restored.ledger.crowns, ninthPaid)
assert.equal(restored.boardLocked(), true)
reloaded.engine.setVariable('villa_day', 10); restored.ledger.day = 10
reloaded.engine.setVariable('villa_phase', 'morning')
assert.equal(restored.boardLocked(), false)
restored.act({ kind: 'restore', key: 'guest_2' })
reloaded.engine.setVariable('tamsin_arrived', true)
restored.act({ kind: 'invite', key: 'tamsin', room: 'guest_2' })
const resident = game.residents.find(one => one.key === 'tamsin')
const privateScene = resident.scenes.find(one => one.gate === 'tamsin_open')
const buttons = []
restored.button = (_x, _y, label, _action, enabled) => buttons.push({ label, enabled })
restored.text = () => {}; restored.detailNavigation = () => {}; restored.detailPage = 0
restored.residentSection = 'spend'; restored.detailPage = resident.scenes.indexOf(privateScene)
restored.residentActions(resident, ['tamsin'])
assert.equal(buttons.find(one => one.label === privateScene.title).enabled, false)
restored.act({ kind: 'scene', result: privateScene.result })
assert.ok(!restored.ledger.seen.includes(privateScene.result))
reloaded.engine.setVariable('tamsin_open', true)
let result
const finish = restored.finish.bind(restored)
restored.finish = value => { result = value }
restored.act({ kind: 'scene', result: privateScene.result })
assert.equal(result, privateScene.result)
assert.ok(!restored.ledger.completed.includes(privateScene.result), 'launching is not completion')
assert.equal(EstateMemories.completeAtReturn(restored.state, 'A different choice'), false)
assert.equal(EstateMemories.completeAtReturn(restored.state, 'Return to the villa'), true)
restored.ledger = estate.readEstateState(restored.state.engine.getVariable(game.stateVariable), 80, game.rooms)
assert.ok(restored.ledger.completed.includes(privateScene.result), 'the authored return boundary records completion')
const beforeTalk = JSON.stringify(restored.ledger)
result = undefined
restored.act({ kind: 'talk', result: resident.talk.result })
assert.equal(result, resident.talk.result)
assert.equal(JSON.stringify(restored.ledger), beforeTalk)
// Open-ended days retain the idle-crew confirmation before Return.
restored.finish = finish; restored.state.refresh = () => {}; restored.scene = { resume() {}, stop() {} }
restored.finish(); assert.equal(restored.closed, false); assert.equal(restored.leaving, true)
restored.finish(); assert.equal(restored.closed, true)
// Direct editor testing explicitly has no chapter calendar.
const standalone = player(session(), estate.newEstateState(80, game.rooms))
standalone.calendar = null; standalone.launchData.mode = 'test'; standalone.ledger.day = 9
standalone.act({ kind: 'settle' }); assert.equal(standalone.ledger.day, 10)

// Startup follows the Ink clock, paying only the saved workday if dusk was skipped.
const clockRun = session()
clockRun.engine.setVariable('villa_day', 2); clockRun.engine.setVariable('villa_phase', 'morning')
const clockView = player(clockRun, { ...estate.newEstateState(80, game.rooms), selected: [0] })
clockView.syncCalendar(true)
assert.equal(clockView.ledger.day, 2)
assert.equal(clockView.ledger.crowns, 80 + 18 + estate.commissionQuote(1, [0]).pay)
assert.equal(clockRun.engine.getVariable('villa_settled'), 1)
const clockFunds = clockView.ledger.crowns
clockView.syncCalendar(true); assert.equal(clockView.ledger.crowns, clockFunds)
clockView.calendar = null; clockView.act({kind:'settle'})
assert.equal(clockView.ledger.day, 2); assert.equal(clockView.ledger.crowns, clockFunds)
const fresh = player(session(), estate.newEstateState(80, game.rooms))
fresh.state.engine.setVariable('villa_day', 5); fresh.state.engine.setVariable('villa_phase', 'morning')
fresh.syncCalendar(false); assert.equal(fresh.ledger.day, 5); assert.equal(fresh.ledger.crowns, 80)
const invalidDraft = player(session(), { ...estate.newEstateState(80, game.rooms), selected: [999] })
invalidDraft.state.engine.setVariable('villa_day', 2); invalidDraft.state.engine.setVariable('villa_phase', 'morning')
invalidDraft.syncCalendar(true); assert.equal(invalidDraft.ledger.crowns, 98)
assert.equal(invalidDraft.state.engine.getVariable('villa_settled'), 1)

// The scene gate is set on completion, not merely on entering Piri's scene.
const piriRun = session()
piriRun.go('whispering_woods_piri_climax')
assert.equal(piriRun.engine.getVariable('piri_is_bred'), true)
const pairView = player(session(), estate.newEstateState(100, game.rooms))
const settle = () => { pairView.ledger = pairView.autoInvite(pairView.ledger) }
pairView.act({kind:'restore',key:'garden'})
assert.deepEqual(Array.from(estate.estateRoomResidents(pairView.ledger, 'garden')), [])
pairView.state.engine.setVariable('lira_is_bred', true)
settle(); assert.deepEqual(Array.from(estate.estateRoomResidents(pairView.ledger, 'garden')), [], 'Half a pair must not move in alone')
pairView.state.engine.setVariable('piri_is_bred', true)
settle()
assert.deepEqual(Array.from(estate.estateRoomResidents(pairView.ledger, 'garden')), ['lira','piri'])

// The authored tour is valid JSON, has real targets, and cannot expose gated rooms.
assert.deepEqual(JSON.parse(JSON.stringify(estate.parseEstateTutorial(game.tutorial))), game.tutorial)
assert.equal(game.tutorial.steps.length, 12)
const tutorialView = player(session(), estate.newEstateState(80, game.rooms))
tutorialView.page = 'commissions'; tutorialView.roomKey = 'east'
const beforeTour = JSON.stringify(tutorialView.ledger)
tutorialView.startTutorial()
tutorialView.act({ kind: 'restore', key: 'east' }); tutorialView.act({ kind: 'settle' })
assert.equal(JSON.stringify(tutorialView.ledger), beforeTour)
for (let i = 0; i < 12; i++) tutorialView.moveTutorial(1)
assert.equal(tutorialView.tutorialStep, -1); assert.equal(tutorialView.page, 'commissions')
const { tutorialSeen, ...afterTour } = tutorialView.ledger
assert.equal(JSON.stringify(afterTour), beforeTour); assert.equal(tutorialSeen, game.tutorial.version)
assert.equal(estate.readEstateState(tutorialView.state.engine.getVariable(game.stateVariable), 80, game.rooms).tutorialSeen, game.tutorial.version)
tutorialView.definition = { ...game, tutorial: { ...game.tutorial, steps: [{ title: 'Secret', text: 'Hidden', page: 'room', target: 'visits', room: 'west' }, ...game.tutorial.steps] } }
assert.equal(tutorialView.tutorialSteps().length, 12)

// Post-restoration scenes must use the same personalized look as the room UI.
const staffInk = readFileSync(resolve(root, 'chapter5/villa-staff.ink'), 'utf8')
for (const [who, knots] of [['tamsin', ['welcome', 'ordinary']], ['isolde', ['welcome', 'night', 'ledger']]]) {
  for (const knot of knots) {
    const section = staffInk.split(`=== villa_${who}_${knot} ===`)[1].split('===')[0]
    assert.ok(section.includes(`# bg: consort_villa/${who}\n`) || section.includes(`# bg: consort_villa/${who}\r\n`))
  }
}

// The current room result and older saved result both open the renamed scene.
for (const result of ['villa_tamsin_ordinary', 'villa_tamsin_night']) {
  for (const open of [true, false]) {
    const run = session()
    run.engine.setVariable('villa_day', 1)
    run.engine.setVariable('tamsin_open', open)
    run.engine.setVariable('villa_result', result)
    run.go('villa_scene_dispatch')
    assert.equal(run.story.state.VisitCountAtPathString('villa_tamsin_ordinary'), 1)
    assert.equal(run.story.currentChoices.some(choice => choice.text === 'Return to the villa'), open)
  }
}
const oldTamsinPath = session()
oldTamsinPath.engine.setVariable('tamsin_open', true)
oldTamsinPath.go('villa_tamsin_night')
assert.equal(oldTamsinPath.story.state.VisitCountAtPathString('villa_tamsin_ordinary'), 1)

// Replay runs on a second Ink instance; completing and exiting it cannot move the live story.
const liveReplay = session()
liveReplay.engine.setVariable('villa_day', 17)
liveReplay.engine.setVariable('villa_phase', 'evening')
liveReplay.engine.setVariable('maren_is_bred', true)
const liveBeforeReplay = liveReplay.story.state.ToJson()
const isolated = new Story(source)
isolated.state.LoadJson(liveBeforeReplay)
isolated.ChoosePathString('villa_maren_evening')
while (isolated.canContinue) isolated.Continue()
assert.equal(isolated.currentChoices[0]?.text, 'Return to the villa')
assert.equal(liveReplay.story.state.ToJson(), liveBeforeReplay)

// Module-level persistence is explicitly suppressed for the lifetime of replay.
const stored = new Map()
const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) }
const { GalleryUnlocks } = loadTs('../Player/src/gallery/GalleryUnlocks.ts', { '@/platform/Storage': { PlayerStorage: storage } })
const galleryBundle = { manifest: { project: { id: 'replay-test' } }, media: { assets: [{ id: 'art', kind: 'background', name: 'room', variants: [{ id: 'look', name: 'default' }] }] }, gallery: { groups: [{ items: [{ assetId: 'art', variantId: 'look' }] }] } }
GalleryUnlocks.use(galleryBundle)
const releaseGallery = GalleryUnlocks.suppress()
GalleryUnlocks.activate('background', 'room', 'default')
assert.equal(stored.size, 0)
releaseGallery(); GalleryUnlocks.activate('background', 'room', 'default')
assert.equal(stored.size, 1)
const { SaveManager } = loadTs('../Player/src/save/SaveManager.ts', {
  '@/config/gameConfig': { SAVE: { version: 3, prefix: 'save:', manualPages: 1, slotsPerPage: 1, quickSlots: 1, autosaveSlots: 1 } },
  '@/platform/Storage': { PlayerStorage: storage }
})
SaveManager.use('replay-test')
const saveState = { bundle: { manifest: { project: { id: 'replay-test' }, contentHash: 'hash' } }, engine: { saveState: () => liveBeforeReplay }, sceneMeta: {} }
const releaseSaves = SaveManager.suppressWrites()
SaveManager.save('manual-1-1', saveState, 'memory')
assert.equal(storage.getItem('save:replay-test:manual-1-1'), null)
releaseSaves(); SaveManager.save('manual-1-1', saveState, 'live')
assert.ok(storage.getItem('save:replay-test:manual-1-1'))

// Authored goals drive a durable player milestone; merely reaching Day 9 is insufficient.
const readyRun = session()
for (const person of game.residents) readyRun.engine.setVariable(person.eligibilityVariable, true)
readyRun.engine.setVariable('tamsin_villa_arc_complete', true)
readyRun.engine.setVariable('isolde_villa_arc_complete', true)
readyRun.engine.setVariable('villa_day', 9)
const extras = game.residents.filter(person => !['tamsin', 'isolde'].includes(person.key)).slice(0, 2)
const readyLedger = { ...estate.newEstateState(1000, game.rooms), day: 9,
  rooms: [...new Set([...estate.newEstateState(1000, game.rooms).rooms, 'guest', 'guest_2', ...extras.map(person => game.rooms.find(room => estate.estateRoomMembers(room).includes(person.key))?.key).filter(Boolean)])],
  residents: extras.map(person => person.key),
  assignments: Object.fromEntries(extras.map(person => [person.key, game.rooms.find(room => estate.estateRoomMembers(room).includes(person.key)).key])) }
assert.equal(estate.estateFinaleReady({ ...readyLedger, rooms: readyLedger.rooms.filter(key => key !== 'guest') }, game, 9, name => readyRun.engine.getVariable(name) === true), false)
const readyView = player(readyRun, readyLedger)
readyView.persist()
assert.equal(readyRun.engine.getVariable('villa_finale_ready'), true)
readyView.ledger = { ...readyView.ledger, rooms: ['hall'] }; readyView.persist()
assert.equal(readyRun.engine.getVariable('villa_finale_ready'), true)

console.log('Villa regressions passed: Day 5 advice, romance/friendship after reload, completion-boundary memories, isolated replay state, suppressed replay saves/gallery writes, locked-scene UI/actions, settlement after reload, open-ended earning days, authored goals and durable finale readiness, late restoration/invitation/scene, standalone clock, personalized scene art.')
