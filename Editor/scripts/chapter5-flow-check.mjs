// Real authored Ink: map handoff, private court pacing, deferral and saved state.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Compiler, Story } from 'inkjs/full'

const root = resolve('data/projects/breedhaven')
const main = resolve(root, 'ink/main.ink')
const compiled = new Compiler(readFileSync(main, 'utf8'), {
  sourceFilename: main, countAllVisits: true,
  fileHandler: { ResolveInkFilename: name => resolve(dirname(main), name), LoadInkFileContents: name => readFileSync(name, 'utf8') }
}).Compile().ToJson()
const built = await build({stdin:{contents:"export {parseMap} from './src/shared/bundle/mapDoc'; export {evaluate} from './src/shared/bundle/condition';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false})
const { parseMap, evaluate } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const map = parseMap(readFileSync(resolve(root,'map.json'),'utf8')).maps.find(m => m.name === 'seedblossom')
const villa = map.locations.find(loc => loc.destination.name === 'villa_arrival')
assert.ok(villa?.art && villa.available)
assert.ok(map.knots.includes('villa_world_map'))

function session(ally = 'tink', saved) {
  const story = new Story(compiled)
  if (saved) story.state.LoadJson(saved)
  else { story.variablesState.trial_ally = ally; story.variablesState.seraphine_relationship = 'love'; story.variablesState.courtcraft = 5; story.variablesState.conviction = 5 }
  const set = (key, value) => { story.variablesState[key] = value }
  const read = key => story.variablesState[key]
  const visits = key => story.state.VisitCountAtPathString(key)
  const drain = () => {
    const tags = [], lines = []
    for (let i=0; story.canContinue; i++) {
      assert.ok(i < 2000, 'Runaway story loop')
      lines.push(story.Continue()); tags.push(...story.currentTags)
    }
    return {tags, text:lines.join('')}
  }
  const go = knot => { story.ChoosePathString(knot); return drain() }
  const pick = pattern => {
    const choice = story.currentChoices.find(c => pattern.test(c.text))
    assert.ok(choice, `Missing ${pattern}: ${story.currentChoices.map(c=>c.text).join(' | ')}`)
    story.ChooseChoiceIndex(choice.index); return drain()
  }
  const accept = () => {
    pick(/Propose a shared bond/)
    if (ally === 'yelena') pick(/Name their jealousy/)
    pick(/Keep Tink untitled|Say Faye is wanted|Separate office from choice|Publicly define their standing/)
    assert.equal(read('shared_relationship'),'accepted')
  }
  const host = {visits,stat:read,npcStat:()=>0,npcStatus:()=>'',npcFlag:()=>false}
  return {story,set,read,visits,go,pick,accept,host}
}

const start = session()
assert.equal(evaluate(villa.available,start.host),false)
const handoff = start.go('sire_consort_after')
assert.ok(handoff.tags.includes('map: open'))
assert.equal(start.visits('shared_court'),0)
assert.equal(start.read('villa_day'),0)
assert.equal(evaluate(villa.available,start.host),true)
start.go(villa.destination.name)
assert.equal(start.read('villa_day'),1)
assert.equal(start.visits('shared_court'),0)
start.set('villa_day',4); start.set('villa_phase','evening'); start.set('villa_ledger','unchanged sentinel')
start.go('villa_world_map'); start.go(villa.destination.name)
assert.equal(start.read('villa_day'),4)
assert.equal(start.read('villa_phase'),'evening')
assert.equal(start.read('villa_ledger'),'unchanged sentinel')

for (const ally of ['tink','faye','dinah','yelena']) {
  for (const acceptedDay of [2,5,7,8]) {
    let run = session(ally)
    run.set('villa_day',2); run.set('villa_morning_seen',2)
    run.go('villa_morning')
    assert.equal(run.visits('shared_court'),1)
    if (acceptedDay === 2) run.accept()
    else {
      run.pick(/Ask for time/)
      run.set('villa_day',acceptedDay); run.set('villa_phase','evening')
      run.go('villa_evening_hub'); run.pick(/Give Seraphine an answer/); run.accept()
    }
    assert.equal(run.read('villa_shared_connection_day'),0)
    assert.equal(run.read('villa_shared_kiss_day'),0)
    for (let day = acceptedDay; day <= 8; day++) {
      run.set('villa_day',day); run.set('villa_phase','evening'); run.set('villa_settled',day)
      run.go('villa_evening_hub')
      const connectionDay = Math.max(4, acceptedDay+1)
      const kissDay = Math.max(6, connectionDay+1)
      assert.equal(run.read('villa_shared_connection_day'),day >= connectionDay ? connectionDay : 0, `${ally}/${acceptedDay}/${day}: connection`)
      assert.equal(run.read('villa_shared_kiss_day'),day >= kissDay ? kissDay : 0, `${ally}/${acceptedDay}/${day}: kiss`)
      assert.equal(run.read('villa_shared_bonded'),false,'Shared night must remain optional')
      assert.equal(run.visits(`shared_${ally}_intimacy`),0)
      assert.equal(run.read('villa_day'),day)
      assert.equal(run.read('villa_settled'),day)
      const connectionVisits = run.visits('shared_private_meeting')
      const kissVisits = run.visits(`shared_${ally}_bonding`)
      run = session(ally,run.story.state.ToJson())
      run.go('villa_hub')
      assert.equal(run.visits('shared_private_meeting'),connectionVisits,'Reload must not repeat connection')
      assert.equal(run.visits(`shared_${ally}_bonding`),kissVisits,'Reload must not repeat kiss')
    }
  }
  for (const status of ['none','declined','deferred']) {
    const run = session(ally)
    run.set('villa_day',8); run.set('villa_phase','evening'); run.set('shared_relationship',status)
    run.go('villa_hub')
    assert.equal(run.visits('shared_private_meeting'),0)
    assert.equal(run.visits(`shared_${ally}_bonding`),0)
  }
  const legacy = session(ally)
  legacy.set('villa_day',7); legacy.set('villa_phase','evening'); legacy.set('shared_relationship','accepted'); legacy.set('villa_shared_bonded',true)
  legacy.go('villa_hub')
  assert.equal(legacy.visits('shared_private_meeting'),0)
  assert.equal(legacy.visits(`shared_${ally}_bonding`),0)
  assert.equal(evaluate(villa.available,legacy.host),true)
}
console.log('Chapter 5 flow passed: map unlock/return, four companions, on-time and late acceptance, no same-day collapse, optional payoff, reloads and legacy saves.')
