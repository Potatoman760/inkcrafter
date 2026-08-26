import {
  BINDING_SLOTS,
  type BindingOverride,
  type BindingSlot,
  type NodeField,
  type WorkflowAnalysis,
  type WorkflowBindings,
  type WorkflowNodeSummary,
  type WorkflowRole
} from '@shared/comfy'

/**
 * Reading a ComfyUI workflow well enough to put someone else's words in it.
 *
 * An API-format export is a flat map of node id to node, where every input is
 * either a literal or a `[nodeId, outputIndex]` tuple naming what feeds it.
 * That tuple is the whole reason this is possible: the graph carries its own
 * wiring, so "where does the positive prompt go" is answerable by walking it
 * rather than by matching names and hoping.
 *
 * The reading is structural on purpose. Matching `class_type === 'KSampler'`
 * works until the author installs a custom sampler, an SDXL text encode, or an
 * efficiency-pack node that does six things at once — which is to say, until
 * they use ComfyUI the way people use ComfyUI. What is stable is the *shape*: a
 * sampler is whatever takes a positive, a negative and a latent.
 *
 * Nothing here touches the filesystem, the network or electron, because all of
 * it is decisions about a data structure and every one of those decisions is
 * worth a test.
 */

export type ComfyInput =
  | { kind: 'link'; node: string; slot: number }
  | { kind: 'value'; value: string | number | boolean }

export interface ComfyNode {
  id: string
  classType: string
  /** `_meta.title` — what the author renamed it to in ComfyUI, when they did. */
  title: string | null
  /** Insertion-ordered, so walking it walks the file's own order. */
  inputs: Map<string, ComfyInput>
}

export interface ComfyGraph {
  nodes: Map<string, ComfyNode>
  /** Node ids in file order. */
  order: string[]
  /**
   * The parsed JSON, untouched.
   *
   * Kept so writing values back is a clone-and-poke rather than a rebuild from
   * the model above. Anything this file does not understand — `_meta`, fields
   * from a custom node, whatever a future ComfyUI adds — survives to the far end
   * exactly as the author exported it, which is the difference between a
   * workflow that runs and one that runs differently.
   */
  source: Record<string, unknown>
}

/** Deep enough for any real chain of conditioning; short enough to stay quick. */
const MAX_DEPTH = 12

/** What a sampler is, in terms of what it takes rather than what it is called. */
const SAMPLER_SHAPE = ['positive', 'negative', 'latent_image'] as const

/**
 * Where prompt text sits, in the order it should be preferred.
 *
 * `text_g` before `text_l`: an SDXL encode splits the prompt into a coarse
 * stream and a fine one, and the coarse one is the one that carries the sense.
 */
const TEXT_FIELDS = ['text', 'text_g', 'text_l', 'prompt', 'string', 'value'] as const

const SEED_FIELDS = ['seed', 'noise_seed'] as const
const CHECKPOINT_FIELDS = ['ckpt_name', 'unet_name', 'model_name'] as const
/**
 * Nodes that pictures come out of, best first.
 *
 * The order is the preference, not a list: a workflow with both a SaveImage
 * and a PreviewImage should be collected from the one that saves, and which of
 * them happens to appear first in the file is not a reason for anything.
 */
const OUTPUT_CLASSES = ['SaveImage', 'SaveImageWebsocket', 'PreviewImage']

/**
 * Where a workflow's source picture comes in.
 *
 * `LoadImage` and its relatives hold a *file name* — a plain string naming
 * something in ComfyUI's own input folder — which is what makes them writable
 * and so bindable at all. A node whose `image` arrives over a link is a step in
 * the middle of the chain, not the place the picture enters.
 */
const IMAGE_FIELDS = ['image'] as const

function isLink(value: unknown): value is [string | number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === 'string' || typeof value[0] === 'number') &&
    typeof value[1] === 'number'
  )
}

function readInput(value: unknown): ComfyInput | null {
  // Node ids are strings everywhere else, but a link tuple is routinely
  // exported with a numeric one. Same node either way.
  if (isLink(value)) return { kind: 'link', node: String(value[0]), slot: value[1] }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { kind: 'value', value }
  }
  // A nested object or array is something this does not model. Left alone —
  // it still travels in `source`, it just cannot be bound to.
  return null
}

/**
 * Reads an export, or says why it is not one.
 *
 * Refuses rather than throws, and names the menu item: "I used Save, not Export
 * (API)" is the first thing that goes wrong for everyone, and the two commands
 * sit next to each other under the same menu.
 */
export function parseGraph(json: string): { graph: ComfyGraph | null; problem: string | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause)
    return { graph: null, problem: `This file is not readable JSON: ${why}` }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { graph: null, problem: 'This file is not a ComfyUI workflow.' }
  }

  const source = parsed as Record<string, unknown>

  // The canvas format is a different shape entirely — nodes in an array, links
  // listed separately — and is what you get from Save rather than Export (API).
  if (Array.isArray(source['nodes'])) {
    return {
      graph: null,
      problem:
        'This is a workflow saved from the ComfyUI canvas, which cannot be run over the API. In ComfyUI use Workflow → Export (API) and save that file here instead.'
    }
  }

  const nodes = new Map<string, ComfyNode>()
  const order: string[] = []

  for (const [id, raw] of Object.entries(source)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    if (typeof record['class_type'] !== 'string') continue

    const inputs = new Map<string, ComfyInput>()
    const rawInputs = record['inputs']
    if (typeof rawInputs === 'object' && rawInputs !== null && !Array.isArray(rawInputs)) {
      for (const [name, value] of Object.entries(rawInputs as Record<string, unknown>)) {
        const input = readInput(value)
        if (input) inputs.set(name, input)
      }
    }

    const meta = record['_meta']
    const title =
      typeof meta === 'object' && meta !== null && typeof (meta as Record<string, unknown>)['title'] === 'string'
        ? ((meta as Record<string, unknown>)['title'] as string)
        : null

    nodes.set(id, { id, classType: record['class_type'], title, inputs })
    order.push(id)
  }

  if (nodes.size === 0) {
    return {
      graph: null,
      problem:
        'Nothing in this file looks like a ComfyUI node. An API-format export is a list of nodes, each with a class_type. Export it again with Workflow → Export (API).'
    }
  }

  return { graph: { nodes, order, source }, problem: null }
}

/** "KSampler #3", or "KSampler #3 (First pass)" when it was renamed. */
function label(graph: ComfyGraph, id: string): string {
  const node = graph.nodes.get(id)
  if (!node) return `#${id}`
  return node.title ? `${node.classType} #${id} ("${node.title}")` : `${node.classType} #${id}`
}

function linkInputs(node: ComfyNode): { name: string; node: string; slot: number }[] {
  const found: { name: string; node: string; slot: number }[] = []
  for (const [name, input] of node.inputs) {
    if (input.kind === 'link') found.push({ name, node: input.node, slot: input.slot })
  }
  return found
}

function valueOf(graph: ComfyGraph, id: string, field: string): string | number | boolean | undefined {
  const input = graph.nodes.get(id)?.inputs.get(field)
  return input?.kind === 'value' ? input.value : undefined
}

/** Every node reachable from `start` by following what feeds it. */
function ancestors(graph: ComfyGraph, start: string): Set<string> {
  const seen = new Set<string>()
  const queue = [start]

  while (queue.length > 0) {
    const id = queue.shift()!
    const node = graph.nodes.get(id)
    if (!node) continue

    for (const link of linkInputs(node)) {
      if (seen.has(link.node)) continue
      seen.add(link.node)
      queue.push(link.node)
    }
  }

  return seen
}

function samplerCandidates(graph: ComfyGraph): string[] {
  const strict = graph.order.filter((id) => {
    const node = graph.nodes.get(id)
    if (!node) return false
    return SAMPLER_SHAPE.every((name) => node.inputs.get(name)?.kind === 'link')
  })
  if (strict.length > 0) return strict

  // Nothing had all three. A sampler that takes its latent by another name is
  // still a sampler, so fall back to the two that matter and the class name.
  return graph.order.filter((id) => {
    const node = graph.nodes.get(id)
    if (!node) return false
    return (
      /sampler/i.test(node.classType) &&
      node.inputs.get('positive')?.kind === 'link' &&
      node.inputs.get('negative')?.kind === 'link'
    )
  })
}

/**
 * Which sampler the graph is about.
 *
 * With a base and a refiner, the refiner is fed by the base — so the refiner can
 * reach the base by walking its inputs, and the base cannot reach the refiner.
 * Keeping the one nothing else can reach picks the last stage, which is the one
 * whose output is the picture.
 */
function pickSampler(
  graph: ComfyGraph,
  candidates: string[],
  problems: string[]
): string | null {
  if (candidates.length === 0) {
    problems.push(
      'No sampler here — nothing in this workflow takes a positive and a negative conditioning, so there is nowhere to put a prompt.'
    )
    return null
  }
  if (candidates.length === 1) return candidates[0]!

  const reach = new Map(candidates.map((id) => [id, ancestors(graph, id)]))
  const downstream = candidates.filter(
    (id) => !candidates.some((other) => other !== id && reach.get(other)?.has(id))
  )

  if (downstream.length === 1) return downstream[0]!

  // Two samplers with nothing between them. Whichever is picked, the other's
  // prompt is left as the author saved it — which in a base-and-refiner pair
  // means half the picture comes from text nobody asked for. Say so.
  const pool = downstream.length > 0 ? downstream : candidates
  const chosen = [...pool].sort((a, b) => Number(b) - Number(a) || b.localeCompare(a))[0]!
  problems.push(
    `There are ${pool.length} samplers with no link between them (${pool.map((id) => label(graph, id)).join(', ')}). The prompt was bound to ${label(graph, chosen)}; the others keep whatever text was saved in them. Repoint it below if that is the wrong one.`
  )
  return chosen
}

/**
 * Walks from a conditioning input to the text nodes behind it.
 *
 * Rarely one hop. A prompt reaches a sampler through whatever the author put in
 * between — a combine, a set-area, a ControlNet apply, a LoRA stack — and every
 * one of those passes conditioning straight through, so following the links is
 * what finds the text on the far side.
 *
 * Bounded and cycle-guarded because this runs while the settings dialog is
 * open, and a graph that loops would otherwise hang it.
 */
function followToText(
  graph: ComfyGraph,
  id: string,
  found: NodeField[],
  seen: Set<string>,
  depth: number
): void {
  if (depth > MAX_DEPTH || seen.has(id)) return
  seen.add(id)

  const node = graph.nodes.get(id)
  if (!node) return

  for (const field of TEXT_FIELDS) {
    const input = node.inputs.get(field)
    if (input?.kind === 'value' && typeof input.value === 'string') {
      // One field per node: a node that holds the text is the end of this
      // branch, not something to walk past.
      found.push({ node: id, field })
      return
    }
  }

  const links = linkInputs(node)
  // Conditioning first, so a combine's own inputs are preferred over the model
  // or the clip hanging off the same node.
  const conditioning = links.filter((link) => link.name.startsWith('conditioning'))
  const rest = links.filter((link) => !link.name.startsWith('conditioning'))

  for (const link of [...conditioning, ...rest]) {
    followToText(graph, link.node, found, seen, depth + 1)
  }
}

/**
 * The node that decides how big the picture is.
 *
 * Deepest wins. A `LatentUpscale` in the middle of a chain also has a width and
 * a height, and writing the requested size there would resize the upscale while
 * leaving the generation at whatever it was — so the search recurses first and
 * only takes the current node when nothing further back had the pair.
 */
function followToSize(
  graph: ComfyGraph,
  id: string,
  seen: Set<string>,
  depth: number
): { width: NodeField; height: NodeField } | null {
  if (depth > MAX_DEPTH || seen.has(id)) return null
  seen.add(id)

  const node = graph.nodes.get(id)
  if (!node) return null

  for (const link of linkInputs(node)) {
    const deeper = followToSize(graph, link.node, seen, depth + 1)
    if (deeper) return deeper
  }

  const width = node.inputs.get('width')
  const height = node.inputs.get('height')
  if (width?.kind === 'value' && typeof width.value === 'number' && height?.kind === 'value' && typeof height.value === 'number') {
    return { width: { node: id, field: 'width' }, height: { node: id, field: 'height' } }
  }

  return null
}

/** Breadth-first from a node, for a literal input with one of these names. */
function findNearby(
  graph: ComfyGraph,
  start: string,
  fields: readonly string[],
  maxDepth: number
): NodeField | null {
  const seen = new Set<string>([start])
  let level = [start]

  for (let depth = 0; depth <= maxDepth; depth++) {
    for (const id of level) {
      for (const field of fields) {
        if (valueOf(graph, id, field) !== undefined) return { node: id, field }
      }
    }

    const next: string[] = []
    for (const id of level) {
      const node = graph.nodes.get(id)
      if (!node) continue
      for (const link of linkInputs(node)) {
        if (seen.has(link.node)) continue
        seen.add(link.node)
        next.push(link.node)
      }
    }

    if (next.length === 0) break
    level = next
  }

  return null
}

/**
 * Where the picture this workflow works from comes in, if it works from one.
 *
 * Reachability from the sampler rather than a particular chain: an img2img
 * graph brings its picture in through a VAEEncode on the latent, while the
 * newer edit models take it through the conditioning instead, and both are
 * genuinely workflows that edit a picture. What they share is that the sampler
 * can see a loaded image at all — a workflow that makes something from nothing
 * has no such node anywhere behind it.
 */
function findImageSource(
  graph: ComfyGraph,
  sampler: string | null
): { chosen: NodeField | null; candidates: NodeField[] } {
  const reachable = sampler ? ancestors(graph, sampler) : new Set(graph.order)

  const found: NodeField[] = []
  for (const id of graph.order) {
    if (sampler !== null && !reachable.has(id)) continue
    for (const field of IMAGE_FIELDS) {
      if (typeof valueOf(graph, id, field) === 'string') found.push({ node: id, field })
    }
  }

  return { chosen: found[0] ?? null, candidates: found }
}

function findOutput(graph: ComfyGraph): { chosen: string | null; candidates: NodeField[] } {
  const named = graph.order
    .filter((id) => OUTPUT_CLASSES.includes(graph.nodes.get(id)?.classType ?? ''))
    .sort(
      (a, b) =>
        OUTPUT_CLASSES.indexOf(graph.nodes.get(a)!.classType) -
        OUTPUT_CLASSES.indexOf(graph.nodes.get(b)!.classType)
    )

  if (named.length > 0) {
    return { chosen: named[0]!, candidates: named.map((id) => ({ node: id, field: 'images' })) }
  }

  // No node with a name we know. Anything nothing else feeds from, that takes
  // images, is where the pictures come out.
  const fedFrom = new Set<string>()
  for (const id of graph.order) {
    const node = graph.nodes.get(id)
    if (!node) continue
    for (const link of linkInputs(node)) fedFrom.add(link.node)
  }

  const sinks = graph.order.filter(
    (id) => !fedFrom.has(id) && graph.nodes.get(id)?.inputs.get('images')?.kind === 'link'
  )

  return {
    chosen: sinks[0] ?? null,
    candidates: sinks.map((id) => ({ node: id, field: 'images' }))
  }
}

function summarise(graph: ComfyGraph): WorkflowNodeSummary[] {
  return graph.order.map((id) => {
    const node = graph.nodes.get(id)!
    const fields: { name: string; value: string | number | boolean }[] = []
    for (const [name, input] of node.inputs) {
      if (input.kind === 'value') fields.push({ name, value: input.value })
    }
    return { id, classType: node.classType, title: node.title, fields }
  })
}

function noBindings(): WorkflowBindings {
  return {
    positive: null,
    negative: null,
    image: null,
    width: null,
    height: null,
    seed: null,
    checkpoint: null,
    batch: null,
    output: null
  }
}

/** Reads a graph and works out where everything goes. */
export function analyse(graph: ComfyGraph): WorkflowAnalysis {
  const problems: string[] = []
  const detected = noBindings()
  const notes: Partial<Record<BindingSlot, string>> = {}
  const candidates: Partial<Record<BindingSlot, NodeField[]>> = {}

  const sampler = pickSampler(graph, samplerCandidates(graph), problems)

  if (sampler) {
    const node = graph.nodes.get(sampler)!

    for (const slot of ['positive', 'negative'] as const) {
      const input = node.inputs.get(slot)
      if (input?.kind !== 'link') continue

      const found: NodeField[] = []
      followToText(graph, input.node, found, new Set(), 0)
      if (found.length === 0) continue

      detected[slot] = found[0]!
      candidates[slot] = found
      notes[slot] = `followed ${label(graph, sampler)} ${slot} → ${label(graph, found[0]!.node)} ${found[0]!.field}`

      if (found.length > 1) {
        problems.push(
          `${found.length} text nodes lead to ${slot} (${found.map((one) => label(graph, one.node)).join(', ')}). ${label(graph, found[0]!.node)} was chosen; pick another below if that is wrong.`
        )
      }
    }

    // Both arriving at one node would make the prompt its own negative.
    if (
      detected.positive &&
      detected.negative &&
      detected.positive.node === detected.negative.node &&
      detected.positive.field === detected.negative.field
    ) {
      problems.push(
        `Positive and negative both lead to ${label(graph, detected.positive.node)}, so writing both would make the prompt its own negative. The negative is left unbound.`
      )
      detected.negative = null
      delete notes.negative
    }

    const latent = node.inputs.get('latent_image')
    if (latent?.kind === 'link') {
      const size = followToSize(graph, latent.node, new Set(), 0)
      if (size) {
        detected.width = size.width
        detected.height = size.height
        notes.width = `${label(graph, size.width.node)} width`
        notes.height = `${label(graph, size.height.node)} height`

        if (valueOf(graph, size.width.node, 'batch_size') !== undefined) {
          detected.batch = { node: size.width.node, field: 'batch_size' }
          notes.batch = `${label(graph, size.width.node)} batch_size`
        }
      }
    }

    // On the sampler itself nearly always; SamplerCustom keeps its noise in a
    // separate node, so look a little way back for it.
    const seed = findNearby(graph, sampler, SEED_FIELDS, 4)
    if (seed) {
      detected.seed = seed
      notes.seed =
        seed.node === sampler
          ? `${label(graph, sampler)} ${seed.field}`
          : `walked back from ${label(graph, sampler)} → ${label(graph, seed.node)} ${seed.field}`
    }

    const model = node.inputs.get('model')
    const checkpoint =
      (model?.kind === 'link' ? findNearby(graph, model.node, CHECKPOINT_FIELDS, MAX_DEPTH) : null) ??
      findNearby(graph, sampler, CHECKPOINT_FIELDS, MAX_DEPTH)
    if (checkpoint) {
      detected.checkpoint = checkpoint
      notes.checkpoint = `${label(graph, checkpoint.node)} ${checkpoint.field}`
    }
  }

  if (detected.positive === null) {
    problems.push(
      'No prompt node is bound, so there is nowhere to put what the assistant is asked to draw. Point "Prompt" at the text node this workflow uses.'
    )
  }

  if (detected.seed === null) {
    problems.push(
      'No seed was found. ComfyUI caches by workflow, so the same prompt will return the same picture every time rather than a new one.'
    )
  }

  // What the workflow is for follows from whether a picture goes into it.
  const image = findImageSource(graph, sampler)
  let roleNote = 'nothing loads a picture, so it makes one from nothing'
  if (image.chosen) {
    detected.image = image.chosen
    candidates.image = image.candidates
    notes.image = `${label(graph, image.chosen.node)} ${image.chosen.field}`
    roleNote = sampler
      ? `${label(graph, image.chosen.node)} reaches ${label(graph, sampler)}`
      : `${label(graph, image.chosen.node)} loads a picture`
  }
  const role: WorkflowRole = image.chosen ? 'edits' : 'creates'

  const output = findOutput(graph)
  if (output.chosen) {
    detected.output = { node: output.chosen, field: 'images' }
    candidates.output = output.candidates
    notes.output = label(graph, output.chosen)
  } else {
    problems.push('No node saves an image, so this workflow would run and produce nothing to file.')
  }

  return { nodes: summarise(graph), sampler, detected, role, roleNote, notes, candidates, problems }
}

/**
 * What a bound field holds right now, when it holds a number.
 *
 * The saved size is the only thing outside this file that needs to read a
 * value back out — a picture drawn in the shape its kind wants should still be
 * drawn at whatever resolution the author tuned the workflow for.
 */
export function boundNumber(graph: ComfyGraph, at: NodeField | null): number | null {
  if (!at) return null
  const value = valueOf(graph, at.node, at.field)
  return typeof value === 'number' ? value : null
}

/** Whether a binding still names something that exists and can be written to. */
function stillValid(graph: ComfyGraph, slot: BindingSlot, at: NodeField): boolean {
  const node = graph.nodes.get(at.node)
  if (!node) return false
  // Nothing is written to the output node; only its identity is used.
  if (slot === 'output') return true
  return node.inputs.get(at.field)?.kind === 'value'
}

/**
 * What was detected, corrected by what the author said, checked against reality.
 *
 * The check matters because an override outlives the workflow it was made
 * against: re-exporting from ComfyUI renumbers the nodes, and a saved binding
 * then points at something that is gone or at something else entirely. A stale
 * one falls back to the detected value and says so — and is *not* deleted, since
 * the author may be halfway through editing the workflow it belongs to.
 */
export function effectiveBindings(
  graph: ComfyGraph,
  analysis: WorkflowAnalysis,
  override: BindingOverride | undefined
): { bindings: WorkflowBindings; problems: string[] } {
  const bindings = noBindings()
  const problems: string[] = []

  for (const slot of BINDING_SLOTS) {
    const overridden = override !== undefined && slot in override
    const chosen = overridden ? (override[slot] ?? null) : analysis.detected[slot]

    if (chosen === null) continue

    if (stillValid(graph, slot, chosen)) {
      bindings[slot] = chosen
      continue
    }

    if (!overridden) continue

    const detected = analysis.detected[slot]
    if (detected && stillValid(graph, slot, detected)) {
      bindings[slot] = detected
      problems.push(
        `The saved binding for "${slot}" points at node #${chosen.node} ${chosen.field}, which this workflow no longer has. Using ${label(graph, detected.node)} ${detected.field} instead.`
      )
    } else {
      problems.push(
        `The saved binding for "${slot}" points at node #${chosen.node} ${chosen.field}, which this workflow no longer has.`
      )
    }
  }

  return { bindings, problems }
}

/**
 * What to change. Every field is optional, and absent means "leave whatever the
 * workflow saved" — including `positive`, so that asking for nothing is a real
 * request and the round trip can be tested as the identity it should be.
 */
export interface GenerationValues {
  positive?: string
  negative?: string
  /** The file name ComfyUI gave the uploaded picture, for an edit workflow. */
  image?: string
  width?: number
  height?: number
  seed?: number
  batch?: number
}

const WRITABLE = ['positive', 'negative', 'image', 'width', 'height', 'seed', 'batch'] as const

/**
 * The graph as it will be sent: the author's own export with our values in it.
 *
 * Built by cloning what was parsed and writing into the clone, never by
 * regenerating from the model above. Everything this file chose not to
 * understand travels through untouched, and a re-parse of the result is equal
 * to the original when nothing was asked for — which is the property the whole
 * feature rests on, because a graph the app quietly mangles produces a wrong
 * picture and no error anywhere.
 */
export function applyBindings(
  graph: ComfyGraph,
  bindings: WorkflowBindings,
  values: GenerationValues
): { prompt: Record<string, unknown>; applied: BindingSlot[]; skipped: BindingSlot[] } {
  const prompt = structuredClone(graph.source)
  const applied: BindingSlot[] = []
  const skipped: BindingSlot[] = []

  for (const slot of WRITABLE) {
    const value = values[slot]
    if (value === undefined) continue

    const at = bindings[slot]
    if (!at) {
      skipped.push(slot)
      continue
    }

    const node = prompt[at.node]
    if (typeof node !== 'object' || node === null) {
      skipped.push(slot)
      continue
    }

    const inputs = (node as Record<string, unknown>)['inputs']
    if (typeof inputs !== 'object' || inputs === null) {
      skipped.push(slot)
      continue
    }

    ;(inputs as Record<string, unknown>)[at.field] = value
    applied.push(slot)
  }

  return { prompt, applied, skipped }
}
