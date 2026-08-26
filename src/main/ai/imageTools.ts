import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { HOTSPOT_STATES, lookFile, MEDIA_DIR, mediaName } from '@shared/mediaDoc'
import { prependComfyPrompt } from '@shared/comfy'
import { imageSize } from '../imageSize'
import { readMedia, scanMedia, writeMedia } from '../media'
import { readNpcs, writeNpcs } from '../npcs'
import { loadSettings } from '../settings'
import { generateImage } from '../comfy/run'
import { uploadImage } from '../comfy/client'
import { applyBindings, boundNumber } from '../comfy/graph'
import { loadWorkflows, resolveWorkflow } from '../comfy/workflows'
import { fileVariant } from './mediaFiling'
import { asText, needProject, projectFolder } from './toolInput'
import { resolveInWorkspace } from './workspacePath'
import type { ToolContext, ToolDefinition, ToolResult } from './workspaceTools'

/**
 * Drawing a picture.
 *
 * The one tool that makes something rather than filing something. Everything
 * else here writes a document the author could have written themselves; this
 * runs a workflow on their own machine and puts the result where the story can
 * reach it.
 *
 * It catalogues what it drew, in the same call. Splitting the two would be
 * tidier — one tool per job, the way the rest of these are — but the picture is
 * already on disk by then, and a model that forgets the second call leaves a
 * file nothing in the app can see. So this owns both halves and says so in its
 * description, which is what stops it being followed by a redundant
 * `write_media`.
 *
 * Where it files depends on what it drew, and that routing is not this file's
 * invention: a character's sprites belong to the character, reachable only
 * through a cast member's `sprite`, exactly as `write_cast` has it.
 */

/**
 * The shape each kind of picture wants.
 *
 * A background is the scene behind everything, so it is wide; a sprite is a
 * person standing in that scene, so it is tall. Getting this wrong is not a
 * matter of taste — a portrait background is letterboxed or cropped by the
 * player, and a landscape sprite is a person lying down.
 *
 * A hotspot has no entry, deliberately. The map forces its box to whatever the
 * art turns out to be, so every shape is as correct as every other.
 */
const ASPECTS: Partial<Record<'character' | 'background' | 'hotspot', number>> = {
  background: 16 / 9,
  character: 9 / 16
}

/** Diffusion models need multiples of eight; some want more, all want this. */
const STEP = 8

const round = (value: number): number =>
  Math.min(Math.max(Math.round(value / STEP) * STEP, 64), 4096)

/**
 * The same picture, in a different shape.
 *
 * Area is kept rather than either side, so the result is the resolution the
 * author tuned the workflow for and only the shape has changed — a workflow
 * saved at 1080×1920 gives a 1920×1080 background, and a 512×512 one gives
 * 680×384. Imposing fixed numbers instead would be wrong for every workflow
 * not tuned to them, and every model has sizes it handles badly.
 */
export function reshape(width: number, height: number, aspect: number): { width: number; height: number } {
  const side = Math.sqrt(width * height)
  return { width: round(side * Math.sqrt(aspect)), height: round(side / Math.sqrt(aspect)) }
}

/**
 * What to draw at: what was asked for, else the shape the kind wants.
 *
 * Told to the model in the tool's description as well, but not left to it. The
 * author's own workflow may well be saved portrait — and then every background
 * would come out portrait whenever the model forgot to say otherwise, which is
 * exactly the failure that is hardest to notice.
 */
export function pictureSize(
  kind: 'character' | 'background' | 'hotspot',
  saved: { width: number | null; height: number | null },
  asked: { width?: number; height?: number }
): { width?: number; height?: number; defaulted: boolean } {
  const aspect = ASPECTS[kind]

  // Both given, or no opinion to impose: nothing to work out.
  if ((asked.width && asked.height) || aspect === undefined) {
    return { width: asked.width, height: asked.height, defaulted: false }
  }

  // One given: the other follows from the shape, rather than being left at
  // whatever the workflow held and making a shape nobody chose.
  if (asked.width) return { width: asked.width, height: round(asked.width / aspect), defaulted: false }
  if (asked.height) return { width: round(asked.height * aspect), height: asked.height, defaulted: false }

  // Neither. Reshape what the workflow was saved at.
  if (!saved.width || !saved.height) return { defaulted: false }
  return { ...reshape(saved.width, saved.height, aspect), defaulted: true }
}

/**
 * How many pictures one turn may draw.
 *
 * A turn may make sixty tool calls and each generation may take minutes, so
 * without a cap a model that has lost the thread can occupy the author's GPU
 * for most of an hour.
 */
const MAX_PER_TURN = 8

/**
 * Kept against the context rather than in a field on it: a `ToolContext` is
 * built fresh for each turn and dropped at the end of it, so a weak key is
 * exactly "this turn" and holds nothing open afterwards.
 */
const DRAWN = new WeakMap<ToolContext, number>()

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function no(summary: string, content: string): ToolResult {
  return { ok: false, summary, content }
}

/** A number the model sent, if it is one and is sane. */
function asSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const rounded = Math.round(value)
  return rounded >= 64 && rounded <= 4096 ? rounded : undefined
}

/**
 * A name nothing else has taken.
 *
 * `-2`, `-3`, rather than replacing: two calls asking for "the harbour" usually
 * means the author wanted a second try at it, and the first one is not
 * recoverable once it is gone.
 */
async function freeFile(root: string, wanted: string): Promise<string> {
  const dot = wanted.lastIndexOf('.')
  const stem = wanted.slice(0, dot)
  const extension = wanted.slice(dot)

  for (let attempt = 1; attempt < 100; attempt++) {
    const relative = attempt === 1 ? wanted : `${stem}-${attempt}${extension}`
    const taken = await stat(`${root}/${relative}`).then(
      () => true,
      () => false
    )
    if (!taken) return relative
  }
  return `${stem}-${Date.now()}${extension}`
}

/** What the catalogue calls a picture file, so a path can be told from a look. */
const PICTURE_FILE = /\.(png|jpe?g|webp|gif|avif)$/i

/**
 * The picture an edit works from, as the assistant named it.
 *
 * Two forms, because the assistant has two ways of thinking about art. It
 * refers to a look the way the story does — "kael/neutral" — and that is what
 * it will reach for; a path under `media/` is the escape hatch for a picture
 * that is in the folder but not yet filed, which is exactly the state a folder
 * of references is in.
 */
export async function sourcePicture(
  project: Parameters<typeof readMedia>[0],
  asked: string
): Promise<{ file: string | null; problem: string | null }> {
  const wanted = asked.trim().replace(/^\/+/, '')
  if (wanted.length === 0) return { file: null, problem: null }

  const onDisk = new Set((await scanMedia(project)).map((one) => one.path))

  // A path names itself.
  if (PICTURE_FILE.test(wanted)) {
    if (onDisk.has(wanted)) return { file: wanted, problem: null }
    return { file: null, problem: `There is no ${wanted} in the project's media/ folder.` }
  }

  const doc = await readMedia(project)
  const [assetName, lookName] = wanted.includes('/')
    ? [wanted.slice(0, wanted.lastIndexOf('/')), wanted.slice(wanted.lastIndexOf('/') + 1)]
    : [wanted, '']

  const asset = doc.assets.find((one) => one.name === mediaName(assetName))
  if (!asset) {
    return {
      file: null,
      problem: `Nothing in the catalogue is called "${assetName}". Name a look like "kael/neutral", or a path under media/.`
    }
  }

  const look = lookName
    ? asset.variants.find((one) => one.name === mediaName(lookName))
    : asset.variants[0]

  if (!look) {
    return {
      file: null,
      problem: `${asset.name} has no look called "${lookName}". It has: ${asset.variants.map((one) => one.name).join(', ') || 'none at all'}.`
    }
  }

  if (!onDisk.has(look.file)) {
    return { file: null, problem: `${asset.name}/${look.name} points at ${look.file}, which is not in media/.` }
  }

  return { file: look.file, problem: null }
}

export const generateImageTool: ToolDefinition = {
  name: 'generate_image',
  description:
    'Draw a new picture with the author’s own ComfyUI, write it into the open project’s media/ folder, and catalogue it — all in one call. Use it when they ask for art that does not exist yet, and give `from` when the new picture should be a variation on one that already exists. It files the picture itself, so never follow it with write_media or write_cast for the same image. It runs one of the workflows the author exported from ComfyUI; if there are several, name one. Slow — a minute is normal — so draw what was asked for and no more.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'What to draw, as a picture is described to an image model: subject, setting, light, style. For a character, preserve the Appearance field from their codex entry when one is available. This replaces whatever text the workflow was saved with.'
      },
      negative: {
        type: 'string',
        description: 'What to avoid. Ignored when the workflow has no negative prompt node.'
      },
      kind: {
        type: 'string',
        enum: ['background', 'character', 'hotspot'],
        description:
          'background for a place the story shows, character for a cast member’s sprite, hotspot for a place on the map. This also decides the shape: a background is the scene behind everything and is drawn wide, 16:9; a character stands in that scene and is drawn tall, 9:16.'
      },
      name: {
        type: 'string',
        description:
          'The ink identifier this becomes: "harbour", so the story can show it with "# bg: harbour". For a character, their inkId.'
      },
      variant: {
        type: 'string',
        description:
          'The look — "dusk" for a background, "happy" for a character. Omit for the default one. A hotspot’s must be idle, hover, active or disabled.'
      },
      from: {
        type: 'string',
        description:
          'A picture that already exists, to work from rather than starting blank — "kael/neutral" for a catalogued look, or a path under media/. Use it for a variation on something: five expressions of one character all come from the same base sprite. Needs a workflow that edits, which the author sets up in Settings → ComfyUI.'
      },
      workflow: {
        type: 'string',
        description:
          'Which saved workflow to run, by name. Omit it — the author has chosen which one to use by default, and it is the right one unless they said otherwise.'
      },
      width: {
        type: 'number',
        description:
          'Pixels. Omit unless the shape needs to be unusual — left out, a background is drawn wide and a character tall, at whatever resolution the workflow is tuned for.'
      },
      height: {
        type: 'number',
        description: 'Pixels. Omit alongside width; giving one derives the other from the kind’s shape.'
      },
      seed: {
        type: 'number',
        description:
          'Omit this. Left out, each call draws something new; fixed, the same prompt returns the identical picture.'
      }
    },
    required: ['prompt', 'kind', 'name']
  },

  async run(args, context): Promise<ToolResult> {
    const project = needProject(context.project)

    const drawn = DRAWN.get(context) ?? 0
    if (drawn >= MAX_PER_TURN) {
      return no(
        `refused — ${MAX_PER_TURN} pictures already this turn`,
        `That is ${MAX_PER_TURN} pictures this turn, which is as many as one turn may draw. Stop and show the author what you have.`
      )
    }

    const prompt = asText(args['prompt']).trim()
    if (prompt.length === 0) {
      return no('generate_image — no prompt', 'Say what to draw. An empty prompt would draw whatever the workflow was saved with.')
    }

    const kind = args['kind']
    if (kind !== 'background' && kind !== 'character' && kind !== 'hotspot') {
      return no(
        'generate_image — unknown kind',
        'kind must be background, character or hotspot. An animation is a clip rather than a drawing.'
      )
    }

    // Before anything is generated: an empty name would resolve to the folder
    // itself rather than to a file in it.
    const given = asText(args['name'])
    const name = mediaName(given)
    if (name.length === 0) {
      return no(
        'generate_image — unusable name',
        `"${given}" leaves nothing that can be an ink identifier. Use letters, digits and underscores.`
      )
    }

    const asked = mediaName(asText(args['variant']))
    if (kind === 'hotspot' && asked.length > 0 && !HOTSPOT_STATES.includes(asked as never)) {
      return no(
        'generate_image — not a hotspot state',
        `A hotspot's looks are its states: ${HOTSPOT_STATES.join(', ')}. "${asked}" is none of them, so the map would never draw it.`
      )
    }

    const { comfy } = await loadSettings()

    // What to work from, resolved before anything is run — a base picture that
    // is not there is worth knowing about before a minute of GPU is spent.
    const base = await sourcePicture(project, asText(args['from']))
    if (base.problem) return no('generate_image — no such picture', base.problem)

    const role = base.file ? 'edits' : 'creates'

    const folder = await loadWorkflows(comfy.workflowDir, comfy)
    if (!folder.ok) {
      return no(
        'generate_image — no workflows',
        `${folder.message} The author sets this up in Settings → ComfyUI. Tell them, and do not try again this turn.`
      )
    }

    const { workflow, problem } = resolveWorkflow(folder.loaded, asText(args['workflow']), {
      role,
      default: comfy.defaults[role]
    })
    if (!workflow) return no('generate_image — no such workflow', problem ?? 'No workflow to run.')

    if (base.file && workflow.bindings.image === null) {
      return no(
        `generate_image — ${workflow.name} takes no picture`,
        `"${workflow.name}" has no node that loads a picture, so ${base.file} would be ignored and it would draw from nothing instead. Point "Source picture" at the right node in Settings → ComfyUI, or use a workflow that edits.`
      )
    }

    // The one fatal binding. A generation that silently ignored what it was
    // asked to draw is worse than not drawing anything.
    if (workflow.bindings.positive === null) {
      return no(
        `generate_image — ${workflow.name} has no prompt node`,
        `The workflow "${workflow.name}" has no prompt node bound, so what you asked for would be ignored and it would draw whatever was saved in it. Ask the author to point "Prompt" at the right node in Settings → ComfyUI.`
      )
    }

    // Handed over before the run: LoadImage holds a name resolved inside
    // ComfyUI's own input folder, not a path, so a picture from the project
    // has to be put there first — which is also what makes this work when
    // ComfyUI is on another machine.
    let loaded: string | undefined
    if (base.file) {
      const bytes = await readFile(
        resolveInWorkspace(context.root, `${projectFolder(project)}/${MEDIA_DIR}/${base.file}`)
      )
      const sent = await uploadImage(
        comfy.baseUrl,
        bytes,
        base.file.split('/').join('-'),
        AbortSignal.timeout(60_000)
      )
      if (!sent.ok || !sent.name) return no('generate_image — could not send the picture', sent.message)
      loaded = sent.name
    }

    const seed = typeof args['seed'] === 'number' ? Math.floor(args['seed']) : Math.floor(Math.random() * 2 ** 31)

    const shape = pictureSize(
      kind,
      {
        width: boundNumber(workflow.graph, workflow.bindings.width),
        height: boundNumber(workflow.graph, workflow.bindings.height)
      },
      { width: asSize(args['width']), height: asSize(args['height']) }
    )

    const { prompt: graph, skipped } = applyBindings(workflow.graph, workflow.bindings, {
      positive: prependComfyPrompt(comfy.promptPrefixes[workflow.file], prompt),
      negative: asText(args['negative']).trim() || undefined,
      image: loaded,
      width: shape.width,
      height: shape.height,
      seed,
      batch: 1
    })

    const started = Date.now()
    const drawing = await generateImage({
      baseUrl: comfy.baseUrl,
      prompt: graph,
      outputNode: workflow.bindings.output?.node ?? null,
      timeoutMs: comfy.timeoutSeconds * 1000,
      onProgress: context.onProgress
    })

    if (!drawing.ok || !drawing.bytes) {
      return no(`generate_image — ${drawing.message.slice(0, 60)}`, drawing.message)
    }

    // What came back is bytes from a service. `/view` answering 200 with an
    // HTML error page is a real thing ComfyUI does.
    if (!drawing.bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      return no(
        'generate_image — not a PNG',
        'ComfyUI returned something that is not a PNG image. Nothing was written.'
      )
    }

    // A look has to be called something: the catalogue drops a variant with
    // an empty name, so "the default one" is not storable however natural it
    // reads. A bare `# bg: harbour` shows the first look whatever it is called,
    // so this costs nothing — and a hotspot drawn without a state named is its
    // idle art, which is the state the map falls back to anyway.
    const variant = asked.length > 0 ? asked : kind === 'hotspot' ? 'idle' : 'default'

    const mediaRoot = `${project.path.replace(/\\/g, '/')}/${MEDIA_DIR}`
    // The same arrangement the author's own uploads use, so a character's
    // drawn looks and their imported ones end up in one folder rather than two.
    const relative = await freeFile(mediaRoot, lookFile(kind, name, variant, '.png'))

    // Contained, as everything written into the workspace is. Not passed
    // through `assertWritableExtension`, deliberately: that list governs what
    // the *model* may name, and here the extension is a constant the app chose,
    // the folder is fixed by `kind`, and every segment is `mediaName` output.
    const absolute = resolveInWorkspace(
      context.root,
      `${projectFolder(project)}/${MEDIA_DIR}/${relative}`
    )

    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, drawing.bytes)

    const size = await imageSize(absolute)
    const notes = await catalogue(project, kind, name, given, variant, relative, context)

    DRAWN.set(context, drawn + 1)

    const measured = size ? `${size.width}×${size.height}` : 'unknown size'
    const seconds = Math.round((Date.now() - started) / 1000)

    if (shape.defaulted && shape.width && shape.height) {
      notes.push(
        kind === 'background'
          ? `Drawn ${shape.width}×${shape.height}, the wide shape a background wants; say width and height if you need another.`
          : `Drawn ${shape.width}×${shape.height}, the tall shape a sprite wants; say width and height if you need another.`
      )
    }

    if (skipped.length > 0) {
      notes.push(
        `The workflow has nowhere to put ${skipped.join(' or ')}, so ${skipped.length === 1 ? 'that was' : 'those were'} left as it was saved.`
      )
    }

    return {
      ok: true,
      summary: `drew ${relative} (${measured}, ${seconds}s)`,
      content: [
        base.file
          ? `Drew ${relative} (${measured}) from ${base.file} with the "${workflow.name}" workflow, seed ${seed}.`
          : `Drew ${relative} (${measured}) with the "${workflow.name}" workflow, seed ${seed}.`,
        ...notes,
        'It is already filed — do not call write_media or write_cast for it.'
      ].join(' ')
    }
  }
}

/**
 * Puts the new picture in the catalogue, and says anything the author needs to
 * know about where it ended up.
 */
async function catalogue(
  project: Parameters<typeof readMedia>[0],
  kind: 'background' | 'character' | 'hotspot',
  name: string,
  display: string,
  variant: string,
  file: string,
  context: ToolContext
): Promise<string[]> {
  const folder = projectFolder(project)
  const notes: string[] = []
  context.written.push(`${folder}/${MEDIA_DIR}/${file}`)

  if (kind !== 'character') {
    const filed = fileVariant(await readMedia(project), kind, name, display, variant, file)
    await writeMedia(project, filed.doc)
    context.written.push(`${folder}/media.json`)

    notes.push(
      kind === 'background'
        ? `Catalogued as the background "${name}"${variant ? `, look "${variant}"` : ''} — the story shows it with "# bg: ${name}${variant ? `/${variant}` : ''}".`
        : `Catalogued as the hotspot "${name}"${variant ? `, state "${variant}"` : ''} — point a map location's art at it.`
    )
    return notes
  }

  // A character's pictures hang off the character. The asset is named after
  // their `sprite`, which is how the cast screen finds them and the only way
  // the app can show one at all.
  const npcs = await readNpcs(project)
  const npc = npcs.npcs.find((one) => one.inkId === name) ?? npcs.npcs.find((one) => one.sprite === name)
  const assetName = npc?.sprite || name

  const filed = fileVariant(
    await readMedia(project),
    'character',
    assetName,
    npc?.name || display,
    variant,
    file
  )
  await writeMedia(project, filed.doc)
  context.written.push(`${folder}/media.json`)

  if (!npc) {
    // Written anyway. The picture is on disk either way, and one nobody has
    // catalogued is worse than one catalogued against a character not yet made.
    notes.push(
      `There is no cast member called "${name}" yet, so nothing in the story can show this. Call write_cast with inkId "${name}" and sprite "${assetName}" to attach it.`
    )
    return notes
  }

  if (npc.sprite !== assetName) {
    // Through writeNpcs, never a file write: it regenerates ink/state.ink, and
    // the declarations the story compiles against live in that file.
    const { written } = await writeNpcs(project, {
      ...npcs,
      npcs: npcs.npcs.map((one) => (one.inkId === npc.inkId ? { ...one, sprite: assetName } : one))
    })
    context.written.push(...written.map((path) => `${folder}/${path}`))
  }

  notes.push(
    `Filed against ${npc.name || name}${variant ? ` as the look "${variant}"` : ''} — the story shows it with "# char: ${assetName}${variant ? `/${variant}` : ''}".`
  )
  return notes
}
