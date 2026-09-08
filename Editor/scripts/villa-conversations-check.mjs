// Real-story dispatch, residency and return checks for household encounters.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import { Compiler, Story } from 'inkjs/full'

const root = resolve('data/projects/breedhaven')
const main = resolve(root, 'ink/main.ink')
const compiled = new Compiler(readFileSync(main, 'utf8'), {
  sourceFilename: main, countAllVisits: true,
  fileHandler: { ResolveInkFilename: name => resolve(dirname(main), name), LoadInkFileContents: name => readFileSync(name, 'utf8') }
}).Compile().ToJson()
const game = JSON.parse(readFileSync(resolve(root, 'minigames.json'), 'utf8')).minigames.find(g => g.name === 'consort_villa')
const module = { exports: {} }
vm.runInNewContext(transformSync(readFileSync('src/shared/bundle/minigame/estate/estate.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module, exports: module.exports })
const { actOnEstate, estateEncounterEnabled, estateRoomMembers, newEstateState, readEstateState } = module.exports
function session(flags = {}) {
  const story = new Story(compiled)
  for (const [key, value] of Object.entries({ villa_day: 12, villa_phase: 'evening', villa_finale_announced: true, ...flags })) story.variablesState[key] = value
  return story
}
function drain(story) {
  let text = ''
  for (let limit = 0; story.canContinue; limit++) {
    assert.ok(limit < 500, 'Conversation should reach a choice')
    text += story.Continue()
  }
  return text
}
function visit(story, knot) { story.ChoosePathString(knot); return drain(story) }
function vars(story) { return JSON.stringify(JSON.parse(story.state.ToJson()).variablesState) }
function checkReturn(story, before) {
  assert.equal(vars(story), before, 'Conversation must not change live variables')
  const choice = story.currentChoices.find(c => c.text === 'Return to the villa')
  assert.ok(choice, 'Authored return boundary must be present')
  story.ChooseChoiceIndex(choice.index); drain(story)
  assert.equal(story.variablesState.villa_day, 12)
  assert.equal(story.variablesState.villa_phase, 'evening')
  assert.ok(story.currentChoices.some(c => c.text === 'Manage the villa'))
}
let checked = 0
for (const romance of [false, true]) {
  const bonds = { tamsin_bond: romance ? 'romance' : 'friend', isolde_bond: romance ? 'romance' : 'friend', tamsin_open: romance, isolde_open: romance }
  for (const encounter of game.encounters) {
    const flags = Object.fromEntries(game.residents.map(p => [p.eligibilityVariable, true]))
    const read = key => flags[key] === true
    const ledger = { ...newEstateState(80, game.rooms), day: 12, rooms: game.rooms.map(r => r.key),
      residents: [...encounter.residents], assignments: Object.fromEntries(encounter.residents.map(key =>
        [key, game.rooms.find(room => estateRoomMembers(room).includes(key)).key])) }
    const action = { kind: 'encounter', result: encounter.result }
    const available = estateEncounterEnabled(encounter, ledger, game, read)
    assert.equal(available, true, encounter.title)
    const launched = actOnEstate(ledger, action, game, read, 18, 0)
    assert.notEqual(launched, ledger)
    assert.equal(JSON.stringify(launched), JSON.stringify(ledger))
    for (const missing of encounter.residents) {
      const absent = { ...ledger, residents: ledger.residents.filter(key => key !== missing) }
      assert.equal(actOnEstate(absent, action, game, read, 18, 0), absent, 'Eligible but absent women must not appear')
      const reloaded = readEstateState(JSON.stringify(absent), 80, game.rooms)
      assert.equal(estateEncounterEnabled(encounter, reloaded, game, read), false)
    }
    const story = session({ ...bonds, ...flags, villa_result: encounter.result })
    const before = vars(story)
    const text = visit(story, 'villa_scene_dispatch')
    assert.ok(text.length > 600, 'Dispatch must reach the full scene')
    checkReturn(story, before); checked++
    const direct = session()
    visit(direct, encounter.result)
    assert.ok(direct.currentChoices.some(c => c.text === 'Manage the villa'), 'Direct unauthorised entry returns safely')
  }
  for (const name of game.residents.map(person => person.key)) {
    const story = session({ ...bonds, ...Object.fromEntries(game.residents.map(p => [p.eligibilityVariable, true])) })
    const before = vars(story)
    visit(story, 'villa_' + name + '_talk')
    checkReturn(story, before); checked++
  }
}
assert.equal(game.encounters.length, 8)
assert.equal(game.encounters.filter(e => !e.residents.some(k => ['tamsin', 'isolde'].includes(k))).length, 6)
const hub = session({ villa_finale_ready: true })
visit(hub, 'villa_evening_hub')
assert.ok(!hub.currentChoices.some(c => /Arrange some company|Invite/.test(c.text)))
console.log('Villa conversations passed: ' + checked + ' solo/group paths; actual residency, departure/reload, guarded dispatch, no live variable changes, and no visitor menu.')
