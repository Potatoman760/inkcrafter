// Fresh-playthrough checks for the nine-room villa. No saved-layout migrations.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Compiler, Story } from 'inkjs/full'

const root = resolve('data/projects/breedhaven')
const main = resolve(root, 'ink/main.ink')
const source = new Compiler(readFileSync(main, 'utf8'), {
  sourceFilename: main, countAllVisits: true,
  fileHandler: { ResolveInkFilename: name => resolve(dirname(main), name), LoadInkFileContents: name => readFileSync(name, 'utf8') }
}).Compile().ToJson()
const bundled = await build({ stdin: { contents: "export * from './src/shared/bundle/estate';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false })
const lib = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const game = JSON.parse(readFileSync(resolve(root, 'minigames.json'), 'utf8')).minigames.find(one => one.name === 'consort_villa')
const allies = ['faye', 'tink', 'yelena', 'dinah']
assert.equal(game.rooms.length, 9)
assert.equal(game.rooms.reduce((sum, room) => sum + room.cost, 0), 385)
assert.equal(game.layoutMigration, undefined)
assert.deepEqual(game.finale.requiredGoalIds, ['couple_settled'])
assert.equal(game.encounters.length, 0)
assert.equal(lib.estateConfiguration(game).residents.length, 6, 'No resident is silently dropped by catalogue parsing')

function session(ally) {
  const story = new Story(source)
  story.variablesState.trial_ally = ally
  story.variablesState.villa_day = 1
  story.variablesState.villa_phase = 'morning'
  story.variablesState.tamsin_arrived = true
  story.variablesState.isolde_arrived = true
  if (ally !== 'tink') story.variablesState[ally + '_complete'] = true
  else story.variablesState.tink_is_bred = true
  const drain = () => { let lines = 0; while (story.canContinue) { assert.ok(++lines < 2000); story.Continue() } }
  const go = knot => { story.ChoosePathString(knot); drain() }
  const read = key => story.variablesState[key] === true
  go('villa_manage')
  return { story, go, read }
}

for (const ally of allies) {
  const { story, go, read } = session(ally)
  let ledger = lib.autoInviteEstateResidents(lib.newEstateState(1000, game.rooms), game, read)
  assert.deepEqual(ledger.residents, [ally])
  assert.equal(ledger.assignments[ally], 'master')
  const lockedGarden = { kind: 'scene', result: `villa_${ally}_garden` }
  assert.equal(lib.actOnEstate(ledger, lockedGarden, game, read, 18, 0), ledger)
  for (const room of game.rooms) ledger = lib.actOnEstate(ledger, { kind: 'restore', key: room.key }, game, read, 18, 0)
  assert.deepEqual(new Set(ledger.residents), new Set([ally, 'tamsin', 'isolde']))
  assert.deepEqual(lib.estateBathGuests(ledger, game, 'baths', read).filter(one => one.bathSprite).map(one => one.key), [ally])
  for (const other of allies.filter(one => one !== ally)) {
    assert.equal(lib.actOnEstate(ledger, { kind: 'scene', result: `villa_${other}_garden` }, game, read, 18, 0), ledger)
  }
  const person = game.residents.find(one => one.key === ally)
  for (const scene of person.scenes) {
    assert.notEqual(lib.actOnEstate(ledger, { kind: 'scene', result: scene.result }, game, read, 18, 0), ledger, scene.result)
    const day = story.variablesState.villa_day, phase = story.variablesState.villa_phase
    go(scene.result)
    assert.deepEqual(story.currentChoices.map(one => one.text), ['Return to the villa'], scene.result)
    assert.equal(story.variablesState.villa_day, day)
    assert.equal(story.variablesState.villa_phase, phase)
  }
  assert.equal(read('villa_couple_settled'), true)
  assert.equal(lib.estateFinaleReady(ledger, game, 8, read), false)
  assert.equal(lib.estateFinaleReady(ledger, game, 9, read), true)
  // No staff rooms, staff romances, other residents or restoration grind required.
  assert.equal(lib.estateFinaleReady(lib.newEstateState(80, game.rooms), game, 9, read), true)

  // Establish the court introduction, then exercise the existing day-spaced arc.
  story.variablesState.villa_day = 2
  story.variablesState.seraphine_relationship = 'compact'
  go('villa_receive_seraphine')
  assert.ok(story.state.VisitCountAtPathString('shared_court') > 0)
  story.variablesState.shared_relationship = 'accepted'
  story.variablesState.villa_shared_since = 2
  story.variablesState.villa_day = 4
  go('villa_receive_seraphine')
  assert.equal(story.variablesState.villa_shared_connection_day, 4)
  go('villa_receive_seraphine')
  assert.equal(story.variablesState.villa_shared_kiss_day, 0)
  story.variablesState.villa_day = 6
  go('villa_receive_seraphine')
  assert.equal(story.variablesState.villa_shared_kiss_day, 6)
  story.variablesState.villa_day = 8
  go('villa_manage')
  assert.equal(read('villa_seraphine_private_ready'), true)
  go('villa_receive_seraphine')
  assert.equal(read('villa_shared_bonded'), false, 'Ordinary invitation never starts the private scene')
  assert.equal(story.variablesState.villa_phase, 'morning')
}

// Commissions still pay once for each story-owned earning day, beyond Day 9.
let ledger = lib.newEstateState(80, game.rooms)
for (let day = 1; day <= 12; day++) {
  ledger = { ...ledger, day, selected: [] }
  const paid = lib.settleWorkday(ledger, day, game, 18, 0)
  assert.equal(paid.income, 18)
  assert.equal(paid.state.crowns, 80 + day * 18)
  ledger = paid.state
}
console.log('Nine-room villa passed: four exclusive partners, 28 room scenes, restoration gates, bath roster, optional staff goals, day-spaced reception visits, separate private invitation, unchanged story phase and twelve earning days.')


