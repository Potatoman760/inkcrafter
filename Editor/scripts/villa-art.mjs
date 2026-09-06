// Draws the Chapter 5 household art with the author's ComfyUI, the way the
// in-app tool does: the same exported workflows, the same prompt prefix, the
// same folders. Sprites are drawn on a white card and cut out afterwards
// (villa-cutout.py); rooms are edits of the two guest rooms the staff inherit.
//
//   node scripts/villa-art.mjs            everything not yet on disk
//   node scripts/villa-art.mjs --force    redraw all of it
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = 'http://127.0.0.1:8188'
const WORKFLOWS = 'G:/ComfyUI_windows_portable/workflows'
const PREFIX = 'AstroWitchV01K2T, comic book style'
const root = resolve('data/projects/breedhaven/media')
const force = process.argv.includes('--force')
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7)

const graph = (name) => JSON.parse(readFileSync(resolve(WORKFLOWS, name), 'utf8'))
const seed = () => Math.floor(Math.random() * 2 ** 31)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run(prompt, outputNode, label) {
  const queued = await fetch(`${BASE}/prompt`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, client_id: 'inkcrafter-villa-art' })
  })
  const { prompt_id, error, node_errors } = await queued.json()
  if (error) throw new Error(`${label}: ${JSON.stringify(error)} ${JSON.stringify(node_errors)}`)
  process.stdout.write(`${label}: queued ${prompt_id} `)
  for (let waited = 0; waited < 20 * 60 * 1000; waited += 1500) {
    await sleep(1500)
    const history = await (await fetch(`${BASE}/history/${prompt_id}`)).json()
    const entry = history[prompt_id]
    if (!entry) { process.stdout.write('.'); continue }
    if (entry.status?.status_str === 'error') throw new Error(`${label}: ${JSON.stringify(entry.status.messages).slice(0, 400)}`)
    const images = entry.outputs?.[outputNode]?.images ?? Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? [])
    if (!images.length) { process.stdout.write('.'); continue }
    const image = images[0]
    const bytes = await (await fetch(`${BASE}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder ?? '')}&type=${image.type}`)).arrayBuffer()
    console.log(` done (${Math.round(waited / 1000)}s)`)
    return Buffer.from(bytes)
  }
  throw new Error(`${label}: timed out`)
}

async function upload(file) {
  const form = new FormData()
  form.append('image', new Blob([readFileSync(file)], { type: 'image/png' }), file.split(/[\\/]/).pop())
  form.append('overwrite', 'true')
  const sent = await (await fetch(`${BASE}/upload/image`, { method: 'POST', body: form })).json()
  return sent.subfolder ? `${sent.subfolder}/${sent.name}` : sent.name
}

/** A sprite: text to image on the comic-book workflow, tall, on a white card. */
async function sprite(id, look, description, options = {}) {
  const stem = options.stem ?? look
  const target = resolve(root, `characters/${id}/${stem}.png`)
  if (!force && (existsSync(target) || existsSync(target.replace(/\.png$/, '-cutout.png')))) return
  const g = graph('krea2 comic book.json')
  g['51'].inputs.text = options.exactPrompt ?? `${PREFIX}\n\n${description}\n\nfull body, standing, facing the viewer, feet visible, plain white background, no text`
  g['57'].inputs.width = 1080; g['57'].inputs.height = 1920
  g['54'].inputs.seed = options.seed ?? seed()
  g['29'].inputs.filename_prefix = `villa_${id}_${stem}`
  mkdirSync(resolve(root, `characters/${id}`), { recursive: true })
  writeFileSync(target, await run(g, '29', `${id}/${look}`))
}

/** A room: an edit of the guest room it grows out of, at the plan's own size. */
async function room(look, from, instruction) {
  const target = resolve(root, `backgrounds/consort_villa/${look}-v1.png`)
  if (!force && existsSync(target)) return
  const g = graph('qweneditfull.json')
  g['7'].inputs.image = await upload(resolve(root, `backgrounds/consort_villa/${from}`))
  g['3'].inputs.prompt = instruction
  g['4'].inputs.prompt = ''
  // Latents want multiples of eight; the last three rows are trimmed afterwards to match the plan.
  g['9'].inputs.width = 1672; g['9'].inputs.height = 944
  g['2'].inputs.seed = seed()
  g['10'].inputs.filename_prefix = `villa_${look}`
  writeFileSync(target, await run(g, '10', `room ${look}`))
}

const STYLE = 'Keep exactly the same camera, 16:9 framing, cream limestone architecture, pilasters, arched window and the garden vista outside it, tiled floor, warm daylight, and the crisp fine dark ink outlines and painted cel-shaded fantasy illustration style. No people, no text, no UI, no watermark. One coherent room.'

const jobs = {
  tamsin_neutral: () => sprite('tamsin', 'neutral',
    'a woman in her mid-twenties, a villa maid, sun-browned freckled skin, warm brown eyes, chestnut hair tied back under a linen kerchief, full-figured and strong from work, practical grey-blue working dress with a cream apron, sleeves rolled to the elbow, plain leather shoes, frank observant expression with a slight half-smile, arms relaxed at her sides'),
  tamsin_happy: () => sprite('tamsin', 'happy',
    'a woman in her mid-twenties, a villa maid, sun-browned freckled skin, warm brown eyes, chestnut hair tied back under a linen kerchief, full-figured and strong from work, practical grey-blue working dress with a cream apron, sleeves rolled to the elbow, plain leather shoes, open laughing smile, one hand on her hip'),
  isolde_neutral: () => sprite('isolde', 'neutral',
    'a tall composed woman in her early thirties, an estate manager, pale olive skin, grey eyes behind thin silver spectacles, dark hair coiled neatly at the nape, fitted slate-green coat over a cream high-collared blouse, long charcoal skirt, a leather-bound ledger held under one arm, straight posture, calm appraising expression'),
  isolde_happy: () => sprite('isolde', 'happy',
    'a tall composed woman in her early thirties, an estate manager, pale olive skin, grey eyes, thin silver spectacles held in one hand, dark hair coiled neatly at the nape, fitted slate-green coat over a cream high-collared blouse, long charcoal skirt, a leather-bound ledger under the other arm, straight posture, small dry warm smile'),
  isolde: () => room('isolde', 'retinue-v1.png',
    `Turn this lilac guest bedroom into an estate manager's working office with private quarters behind it. Replace the bed, bedside tables and chest with a large oak desk under the arched window stacked with leather ledgers, tied correspondence, an inkstand and a brass lamp; put tall bookshelves full of books along the left wall where the painting was, a comfortable reading chair with a small side table beside them, and a narrow open doorway at the far right showing a quiet bedroom with a made bed beyond. Slate-green and cream fabrics instead of lilac. ${STYLE}`),
  tamsin: () => room('tamsin', 'visitor-v1.png',
    `Make this plain guest bedroom a maid's own sunny chamber. Keep the single bed but dress it in a handmade patchwork quilt in warm reds, ochres and cream; fill the open window with flowers in pots and put a jug of wildflowers on the sill; hang a carved wooden shelf on the wall holding small keepsakes: a shell, a painted cup, a ribbon, a little wooden bird; add a rag rug, a plain wooden chair with a folded apron over its back, and bunches of herbs drying from a hook. Cosy, handmade, personal, not grand. ${STYLE}`)
}

if (process.argv.includes('--bath-portraits')) {
  const metadata = JSON.parse(readFileSync(resolve(root, '../chapter5/villa-bath-art.json'), 'utf8'))
  if (metadata.prefix !== PREFIX) throw new Error('Unexpected portrait prefix')
  for (const [id, character] of Object.entries(metadata.characters)) {
    if (only && only !== id) continue
    const exactPrompt = `${PREFIX}\n\nGeneral face and body: ${character.generalFaceAndBody}\n\nClothing: ${character.clothing}\n\nExpression and pose: ${character.pose}\n\nComposition: ${metadata.composition}`
    await sprite(id, 'bath', '', { stem: 'bath-v1', seed: character.seed, exactPrompt })
  }
} else if (process.argv.includes('--portraits-v2')) {
  const metadata = JSON.parse(readFileSync(resolve(root, '../chapter5/villa-character-art.json'), 'utf8'))
  if (metadata.prefix !== PREFIX) throw new Error('Unexpected portrait prefix')
  for (const [id, character] of Object.entries(metadata.characters)) {
    for (const [look, expression] of Object.entries(character.expressions)) {
      if (only && only !== `${id}_${look}`) continue
      const exactPrompt = `${PREFIX}\n\nGeneral face and body: ${character.generalFaceAndBody}\n\nClothing: ${character.clothing}\n\nExpression and pose: ${expression}\n\nComposition: ${metadata.composition}`
      await sprite(id, look, '', { stem: `${look}-v2`, seed: character.seed, exactPrompt })
    }
  }
} else {
  for (const [name, job] of Object.entries(jobs)) {
    if (only && name !== only) continue
    await job()
  }
}
console.log('Art done.')
