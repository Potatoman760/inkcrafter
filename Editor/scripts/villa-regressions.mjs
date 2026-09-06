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
  vm.runInNewContext(code, { module, exports: module.exports, console, Map, Set, JSON,
    require: name => { if (name in imports) return imports[name]; throw new Error(`Unexpected import: ${name}`) } }, { filename: file })
  return module.exports
}
const { NpcManager } = loadTs('../Player/src/state/NpcManager.ts', { '@/state/npcs': { npcVar: (id, key) => `${id}_${key}` } })
const estate = loadTs('src/shared/bundle/estate.ts')
const { EstateScene } = loadTs('../Player/src/scenes/EstateScene.ts', {
  phaser: { Scene: class {} }, '@/config/gameConfig': { SceneKey: { Estate: 'Estate' } },
  '@/state/registry': {}, '@/bundle/registry': {}, '@/bundle/spec/bundle/minigameDoc': {},
  '@/bundle/spec/bundle/estate': estate, '@/input/FocusNavigation': {}, '@/ui/EstateUI': {}
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
  run.go('villa_daytime'); run.pick(/Walk the Noble Quarter/); run.pick(/Honour the promise/)
  set('villa_day', 3); run.go('villa_daytime'); run.pick(/Answer the guild/); run.pick(/Follow her advice/)
  assert.equal(run.engine.getVariable('isolde_trust'), 2)
  set('villa_day', 5); set('villa_phase', 'morning'); set('villa_morning_seen', 4)
  run.go('villa_morning'); run.pick(/Ask Isolde what she would send/)
  assert.equal(run.engine.getVariable('isolde_trust'), 3)
  run = session(run.story.state.ToJson())
  set('villa_day', 6); run.go('villa_daytime'); run.pick(/What Isolde has not said/)
  run.pick(romance ? /Tell her it is not unwelcome/ : /Tell her honestly that you cannot/)
  assert.equal(run.engine.getVariable(romance ? 'isolde_open' : 'isolde_settled'), true)
  run.go('villa_daytime')
  assert.ok(!run.story.currentChoices.some(one => /What Isolde has not said/.test(one.text)))
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
for (const phase of ['morning', 'evening', 'done']) {
  reloaded.engine.setVariable('villa_phase', phase)
  assert.equal(restored.boardLocked(), true)
  restored.settleIfDue(); assert.equal(restored.ledger.crowns, paid)
  restored.act({ kind: 'contract', index: 0 }); assert.equal(restored.ledger.selected.length, 0)
  restored.act({ kind: 'settle' }); assert.equal(restored.ledger.crowns, paid)
}
restored.act({ kind: 'restore', key: 'guest_2' })
reloaded.engine.setVariable('tamsin_arrived', true)
restored.act({ kind: 'invite', key: 'tamsin', room: 'guest_2' })
const resident = game.residents.find(one => one.key === 'tamsin')
const privateScene = resident.scenes.find(one => one.gate === 'tamsin_open')
const buttons = []
restored.button = (_x, _y, label, _action, enabled) => buttons.push({ label, enabled })
restored.text = () => {}; restored.detailNavigation = () => {}; restored.detailPage = 0
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
assert.ok(restored.ledger.seen.includes(privateScene.result))
// Final-day Return needs no second idle-day confirmation.
restored.finish = finish; restored.state.refresh = () => {}; restored.scene = { resume() {}, stop() {} }
restored.finish(); assert.equal(restored.closed, true); assert.equal(restored.leaving, false)
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
pairView.act({kind:'restore',key:'garden'})
assert.equal(pairView.invitations('garden').length, 0)
pairView.state.engine.setVariable('piri_is_bred', true)
pairView.state.engine.setVariable('lira_is_bred', true)
assert.equal(pairView.invitations('garden').length, 1)
pairView.act({kind:'invite',key:'lira',room:'garden'})
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
for (const [who, knots] of [['tamsin', ['welcome', 'night']], ['isolde', ['welcome', 'night', 'ledger']]]) {
  for (const knot of knots) {
    const section = staffInk.split(`=== villa_${who}_${knot} ===`)[1].split('===')[0]
    assert.ok(section.includes(`# bg: consort_villa/${who}\n`) || section.includes(`# bg: consort_villa/${who}\r\n`))
  }
}
console.log('Villa regressions passed: Day 5 advice, romance/friendship after reload, no skipped/replayed stages, locked-scene UI/actions, settlement after reload, no final-day earnings/warnings, late restoration/invitation/scene, standalone clock, personalized scene art.')
