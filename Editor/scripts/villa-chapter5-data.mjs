// The Chapter 5 calendar and household, written into Breedhaven's catalogues.
//
// Editor mode has no write_variables or write_cast, so this does what those
// tools would: mints ids, keeps every rule they enforce, and regenerates
// ink/state.ink afterwards. Idempotent — each entry is added only when absent
// — so it can be rerun after the art lands to file the new looks.
import { build } from 'esbuild'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('data/projects/breedhaven')
const compiled = await build({
  stdin: {
    contents: [
      "export { newId } from './src/shared/ids';",
      "export { newVariable, addVariable } from './src/shared/statsDoc';",
      "export { newNpcVariable } from './src/shared/bundle/npcDoc';",
      "export { newAsset, addAsset, newVariant, addVariant, lookFile } from './src/shared/mediaDoc';",
      "export { newPlanNode } from './src/shared/planDoc';",
      "export { renderStateInk } from './src/shared/statsInk';"
    ].join('\n'),
    resolveDir: process.cwd(), loader: 'ts'
  },
  bundle: true, platform: 'node', format: 'esm', write: false
})
const lib = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

const read = (name) => JSON.parse(readFileSync(resolve(root, name), 'utf8'))
const write = (name, doc) => writeFileSync(resolve(root, name), JSON.stringify(doc, null, 2) + '\n')
const changes = []

// --- stats.json: the calendar the story owns ---------------------------------
let stats = read('stats.json')
const wantVariable = (name, kind, initial, description) => {
  if (stats.variables.some((one) => one.name === name)) return
  stats = lib.addVariable(stats, { ...lib.newVariable(name, kind), name, initial, description })
  changes.push(`variable ${name}`)
}
wantVariable('villa_day', 'number', 0, 'The Chapter 5 calendar: 0 before the villa is handed over, then 1 to 9. Owned by the story; the villa reads it.')
wantVariable('villa_phase', 'text', 'morning', 'Where the villa day stands: morning or evening. The villa pays the day’s work on a visit made in the evening.')
wantVariable('villa_settled', 'number', 0, 'The last villa day whose crew work was paid. Written by the villa, so a reload never pays twice.')
wantVariable('villa_morning_seen', 'number', 0, 'The last day whose morning news was shown, so returning to the morning does not repeat it.')
wantVariable('villa_shared_since', 'number', 0, 'The day a shared bond was accepted; the promised afternoon comes after it.')
wantVariable('villa_complication_seen', 'boolean', false, 'Whether the mid-week court complication has arrived.')
wantVariable('villa_shared_bonded', 'boolean', false, 'Whether the afternoon Seraphine asked for has happened, after which the shared bond is whole.')
write('stats.json', stats)

// --- npcs.json: the two who come with the house ------------------------------
let npcs = read('npcs.json')
const staff = [
  { inkId: 'tamsin', name: 'Tamsin' },
  { inkId: 'isolde', name: 'Isolde' }
]
for (const who of staff) {
  if (npcs.npcs.some((one) => one.inkId === who.inkId)) continue
  const variables = [
    { ...lib.newNpcVariable('boolean', 'arrived', 'Arrived'), initial: false },
    { ...lib.newNpcVariable('number', 'trust', 'Trust'), initial: 0, min: 0, max: 3 },
    { ...lib.newNpcVariable('text', 'bond', 'Bond'), initial: 'unset', values: ['unset', 'romance', 'friend'] },
    { ...lib.newNpcVariable('boolean', 'open', 'Door open'), initial: false },
    { ...lib.newNpcVariable('boolean', 'settled', 'Settled'), initial: false }
  ]
  npcs = { ...npcs, npcs: [...npcs.npcs, { id: lib.newId('med'), inkId: who.inkId, name: who.name, sprite: who.inkId, variables }] }
  changes.push(`cast ${who.name}`)
}
write('npcs.json', npcs)

// --- media.json: character assets, with whatever looks are on disk ------------
let media = read('media.json')
for (const who of staff) {
  let asset = media.assets.find((one) => one.kind === 'character' && one.name === who.inkId)
  if (!asset) {
    asset = { ...lib.newAsset(who.name, 'character'), name: who.inkId }
    media = lib.addAsset(media, asset)
    changes.push(`character asset ${who.inkId}`)
  }
  for (const look of ['neutral', 'happy']) {
    const plain = lib.lookFile('character', who.inkId, look, '.png')
    const file = existsSync(resolve(root, 'media', plain.replace(/\.png$/, '-cutout.png'))) ? plain.replace(/\.png$/, '-cutout.png') : plain
    if (!existsSync(resolve(root, 'media', file))) continue
    if (asset.variants.some((one) => one.name === look)) continue
    media = lib.addVariant(media, asset.id, lib.newVariant(look, file))
    asset = media.assets.find((one) => one.id === asset.id)
    changes.push(`look ${who.inkId}/${look}`)
  }
}
// The fitted rooms, when drawn: looks of the villa's own background asset.
const villaArt = media.assets.find((one) => one.kind === 'background' && one.name === 'consort_villa')
const roomLook = (look) => {
  const newer = `backgrounds/consort_villa/${look}-v2.png`
  const file = existsSync(resolve(root, 'media', newer)) ? newer : `backgrounds/consort_villa/${look}-v1.png`
  if (!existsSync(resolve(root, 'media', file))) return null
  let variant = villaArt.variants.find((one) => one.name === look)
  if (!variant) {
    variant = lib.newVariant(look, file)
    media = lib.addVariant(media, villaArt.id, variant)
    changes.push(`look consort_villa/${look}`)
  } else if (variant.file !== file) {
    variant.file = file
    changes.push(`updated art consort_villa/${look}`)
  }
  return { assetId: villaArt.id, variantId: variant.id }
}
const tamsinRoom = roomLook('tamsin')
const isoldeRoom = roomLook('isolde')
const officeEmpty = roomLook('office_unrestored')
const tamsinEmpty = roomLook('tamsin_unrestored')
write('media.json', media)

// --- minigames.json: prices, staff rooms, residents, calendar -----------------
const minigames = read('minigames.json')
const villa = minigames.minigames.find((one) => one.kind === 'estate' && one.name === 'consort_villa')
const lookOf = (name) => { const v = villaArt.variants.find((one) => one.name === name); return { assetId: villaArt.id, variantId: v.id } }
const room = (key) => villa.rooms.find((one) => one.key === key)
for (const [key, cost] of [['west', 120], ['west_2', 120], ['upper', 120]]) {
  if (room(key).cost !== cost) { room(key).cost = cost; changes.push(`${key} costs ${cost}`) }
}
// The two guest rooms become the staff's: the plain room is their quarters
// from the first day, and the fit-out is the restoration.
const fitOut = (key, patch) => {
  const target = room(key)
  const before = JSON.stringify(target)
  Object.assign(target, patch)
  delete target.startsActive
  if (JSON.stringify(target) !== before) changes.push(`${key} → ${patch.name}`)
}
fitOut('guest', {
  name: 'Isolde’s office', cost: 90, beds: 1, residentKey: 'isolde', requires: 'hall',
  description: 'A working office with quarters behind it. Fitted out, it is hers: ledgers and correspondence on one side, books and comfort on the other.',
  unrestoredBackground: officeEmpty ?? lookOf('retinue'),
  background: isoldeRoom ?? lookOf('retinue')
})
fitOut('guest_2', {
  name: 'Tamsin’s chamber', cost: 60, beds: 1, residentKey: 'tamsin', requires: 'hall',
  description: 'The sunny room off the courtyard. Fitted out, it fills with flowers, handmade furnishings and the keepsakes she never had a shelf for.',
  unrestoredBackground: tamsinEmpty ?? lookOf('visitor'),
  background: tamsinRoom ?? lookOf('visitor')
})
const resident = (key, name, requirement, roomKey, scenes) => {
  if (villa.residents.some((one) => one.key === key)) return
  villa.residents.push({ key, name, eligibilityVariable: `${key}_arrived`, requirement, sprite: key,
    scenes: scenes.map(([result, title, gate]) => ({ room: roomKey, result, title, ...(gate ? { gate } : {}) })) })
  changes.push(`resident ${name}`)
}
resident('tamsin', 'Tamsin', 'She arrives with the house on the first day.', 'guest_2', [
  ['villa_tamsin_welcome', 'A room of her own'],
  ['villa_tamsin_night', 'A door left open', 'tamsin_open'],
  ['villa_tamsin_step', 'Tea on the step', 'tamsin_settled']
])
resident('isolde', 'Isolde', 'She arrives with the house on the first day.', 'guest', [
  ['villa_isolde_welcome', 'The office, hers'],
  ['villa_isolde_night', 'After the ledgers close', 'isolde_open'],
  ['villa_isolde_ledger', 'A last entry', 'isolde_settled']
])
if (!villa.calendar) {
  villa.calendar = { day: 'villa_day', settled: 'villa_settled', when: { variable: 'villa_phase', value: 'evening' }, lastDay: 9 }
  changes.push('calendar')
}
villa.calendar.lastWorkday = 8
// Room restoration is independent; the pair shares one gated invitation.
for (const one of villa.rooms) one.requires = null
Object.assign(room('garden'), { beds: 2, companionKey: 'piri', inviteTogether: true })
const lira = villa.residents.find(one => one.key === 'lira')
if (lira) {
  lira.eligibilityVariable = 'lira_is_bred'
  lira.requirement = 'Finish Piri’s scene in the Whispering Woods. Lira and Piri move in together.'
  if (!villa.residents.some(one => one.key === 'piri')) villa.residents.push({ key: 'piri', name: 'Piri', eligibilityVariable: 'piri_is_bred', requirement: lira.requirement, sprite: '', scenes: [] })
}
write('minigames.json', minigames)

// --- plan.json: the two new scenes of chapter 5 --------------------------------
const plan = read('plan.json')
const chapter = (function find(nodes) { for (const n of nodes) { if (n.id === 'pln_hazz7h6pqe') return n; const hit = find(n.children ?? []); if (hit) return hit } return null })(plan.nodes)
const scene = (title, knot, file, summary) => {
  if (chapter.children.some((one) => one.files?.includes(file))) return
  const at = chapter.children.findIndex((one) => one.knot === 'villa_arrival')
  const node = { ...lib.newPlanNode(title), summary, status: 'drafting', knot, files: [file], tags: ['villa'] }
  chapter.children.splice(at + 1, 0, node)
  changes.push(`plan scene ${title}`)
}
scene('Nine Days at the Villa', 'villa_handover', 'chapter5/villa-days.ink',
  'The interval between the consummation and the first formal reception, as nine villa days: a morning, one daytime activity, an evening at the villa where the day’s commissions are paid, and sleep. The shared-court beats are spread across the days, and Ask for time genuinely defers.')
scene('The Household Staff', 'tamsin_first', 'chapter5/villa-staff.ink',
  'Tamsin, the maid, and Isolde, the estate manager: two adult women who come with the house. Each has an introduction, an early connection, a personal turning point, and an optional intimate payoff or an equally complete professional resolution, with a fitted room of her own.')
const villaNode = chapter.children.find((one) => one.knot === 'villa_arrival')
if (villaNode && !villaNode.summary.includes('calendar')) {
  villaNode.summary += ' Under the Chapter 5 calendar the villa no longer keeps its own days: the story pays each day’s work once, at dusk.'
  changes.push('plan summary')
}
write('plan.json', plan)

// --- codex: who they are, for whoever writes them next -----------------------
const codexDir = resolve('data/codex/breedhaven/characters')
const NL = String.fromCharCode(10)
const entry = (file, name, aliases, tags, appearance, details, body) => {
  const path = resolve(codexDir, file)
  if (existsSync(path)) return
  const front = [
    '---', `id: ${lib.newId('cdx')}`, `name: ${name}`, 'type: character',
    'aliases:', ...aliases.map((a) => `  - ${a}`), 'tags:', ...tags.map((t) => `  - ${t}`),
    'aiContext: detected', 'tracking:', '  byName: true', '  caseSensitive: false', '  exclusions: []',
    'relations: []', `appearance: ${appearance}`, 'details:',
    ...details.flatMap(([label, value]) => [`  - label: ${label}`, `    value: ${JSON.stringify(value)}`, '    ai: always']),
    '---', ''
  ]
  writeFileSync(path, front.join(NL) + body.trim() + NL)
  changes.push(`codex ${name}`)
}
entry('tamsin.md', 'Tamsin', ['the maid', 'the villa’s maid'], ['the Consort’s Villa', 'household'],
  'A woman in her mid-twenties with sun-browned, freckled skin, warm brown eyes and chestnut hair tied back under a linen kerchief. Full-figured and strong from work. She wears a practical grey-blue working dress with a cream apron, sleeves rolled to the elbow, and plain leather shoes. Her expression is frank and observant, quick to a half-smile.',
  [['Age', '26'], ['Post', 'Maid of the Consort’s Villa; cook when the cook is late'], ['Voice', 'Practical, warm, playfully frank. Says the thing the maid should not say, and means it.'], ['Room', 'The sunny chamber off the courtyard, once fitted out: flowers, handmade furnishings, a shelf for her keepsakes.']],
  `Tamsin came with the house. She kept it through the last lord’s tenancy and through the year it stood empty, and knows which shutters stick, which chimney draws and which neighbour’s cat has designs on the garden. She notices how a man carries the heavy end more than she notices his title.

She works alongside Kael rather than for him in the first days, sorting the old rooms and claiming the courtyard for the washing. What she wants is to be asked to stay rather than assumed, and a room of her own with the door on the sunny side. She says the last thing plainly, once, and can live in either answer: a door left open, or tea on the step and a house with walls she likes. Her wages, her post and her competence never depend on which.`)
entry('isolde.md', 'Isolde', ['Isolde Verrane', 'the estate manager', 'the manager'], ['the Consort’s Villa', 'household', 'Noble Quarter'],
  'A tall, composed woman in her early thirties with pale olive skin, grey eyes behind thin silver spectacles, and dark hair coiled neatly at the nape. She wears a fitted slate-green coat over a cream high-collared blouse and a long charcoal skirt, and usually carries a leather-bound ledger under one arm. Her posture is straight and her expression calm and appraising, with a dry smile kept in reserve.',
  [['Age', '32'], ['Post', 'Estate manager of the Consort’s Villa, by appointment of the Chamberlain'], ['Voice', 'Precise, dry, respectfully contradictory. Usually has a version prepared.'], ['Room', 'The office off the reception hall with private quarters behind it, once fitted out: ledgers on one side, books on the other.']],
  `Isolde Verrane runs the villa: the restoration allowance, the crews, the commission notices from the Noble Quarter and the letters that arrive before Kael is dressed. She explains the household budget through actual business, walks the Quarter as if she had drawn it, and reads other people’s post professionally.

She took the post expecting to manage a man the whole city was watching. She did not expect to be asked what she thought, or to be listened to. She keeps judgement and company in separate columns, does nothing she has not said aloud, and says the imprecise thing exactly once. Whichever answer Kael gives, she is exact again from the next morning and glad of the post.`)

// --- ink/state.ink: generated from the catalogues, never edited ---------------
writeFileSync(resolve(root, 'ink/state.ink'), lib.renderStateInk(stats, npcs))

console.log(changes.length ? 'Changed: ' + changes.join(', ') : 'Nothing to change.')
console.log('state.ink regenerated.')
