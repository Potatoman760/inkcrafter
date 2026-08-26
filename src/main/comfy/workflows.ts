import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ComfySettings,
  WorkflowAnalysis,
  WorkflowBindings,
  WorkflowListResult,
  WorkflowRole,
  WorkflowSummary
} from '@shared/comfy'
import { WORKFLOW_ROLES, ROLE_LABELS } from '@shared/comfy'
import { stripBom } from '../text'
import { analyse, effectiveBindings, parseGraph, type ComfyGraph } from './graph'

/**
 * The folder of workflows the author exported.
 *
 * A folder rather than a setting per workflow, because this is how people
 * already keep them: ComfyUI's Export (API) writes a file, and the author has a
 * pile of those. Dropping another one in is how a new one arrives, and nothing
 * in the app has to be told.
 *
 * A file that will not parse is kept in the list with its problem attached
 * rather than dropped. A workflow that has silently vanished from a picker is
 * far harder to understand than one sitting there saying what is wrong with it.
 */

/** Enough for any workflow; past this something else is in the folder. */
const MAX_WORKFLOW_BYTES = 4 * 1024 * 1024

/** A workflow read, understood, and ready to run. */
export interface LoadedWorkflow {
  /** File name including `.json` — what overrides are keyed by. */
  file: string
  /** File name without it — what the assistant calls it. */
  name: string
  graph: ComfyGraph
  analysis: WorkflowAnalysis
  bindings: WorkflowBindings
  problems: string[]
  /** What it is for, after any correction the author made. */
  role: WorkflowRole
  roleByHand: boolean
}

export interface BrokenWorkflow {
  file: string
  name: string
  problem: string
}

export interface LoadResult {
  ok: boolean
  message: string
  loaded: LoadedWorkflow[]
  broken: BrokenWorkflow[]
}

export async function loadWorkflows(
  dir: string | null,
  comfy: Pick<ComfySettings, 'overrides' | 'roles'>
): Promise<LoadResult> {
  if (dir === null || dir.trim().length === 0) {
    return { ok: false, message: 'No workflow folder is chosen yet.', loaded: [], broken: [] }
  }

  let names: string[]
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    names = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code
    return {
      ok: false,
      message:
        code === 'ENOENT'
          ? `There is no folder at ${dir}.`
          : `Could not read ${dir}: ${cause instanceof Error ? cause.message : String(cause)}`,
      loaded: [],
      broken: []
    }
  }

  if (names.length === 0) {
    return {
      ok: false,
      message: `No .json files in ${dir}. In ComfyUI use Workflow → Export (API) and save into this folder.`,
      loaded: [],
      broken: []
    }
  }

  const loaded: LoadedWorkflow[] = []
  const broken: BrokenWorkflow[] = []

  for (const file of names) {
    const name = file.replace(/\.json$/i, '')

    let text: string
    try {
      text = stripBom(await readFile(join(dir, file), 'utf8'))
    } catch (cause) {
      broken.push({ file, name, problem: `Could not read it: ${cause instanceof Error ? cause.message : String(cause)}` })
      continue
    }

    if (text.length > MAX_WORKFLOW_BYTES) {
      broken.push({ file, name, problem: 'This file is far too large to be a workflow.' })
      continue
    }

    const { graph, problem } = parseGraph(text)
    if (!graph) {
      broken.push({ file, name, problem: problem ?? 'This is not a workflow.' })
      continue
    }

    const analysis = analyse(graph)
    const effective = effectiveBindings(graph, analysis, comfy.overrides[file])
    const byHand = comfy.roles[file]

    loaded.push({
      file,
      name,
      graph,
      analysis,
      bindings: effective.bindings,
      problems: [...analysis.problems, ...effective.problems],
      role: byHand ?? analysis.role,
      roleByHand: byHand !== undefined
    })
  }

  return { ok: loaded.length > 0, message: '', loaded, broken }
}

/** The same reading, flattened for the renderer — no graphs, no Maps. */
export async function listWorkflows(
  dir: string | null,
  comfy: Pick<ComfySettings, 'overrides' | 'roles' | 'defaults'>
): Promise<WorkflowListResult> {
  const result = await loadWorkflows(dir, comfy)
  const chosen = new Map(
    WORKFLOW_ROLES.map((role) => [role, defaultFor(result.loaded, role, comfy.defaults[role])])
  )

  const workflows: WorkflowSummary[] = [
    ...result.loaded.map((one) => ({
      file: one.file,
      name: one.name,
      analysis: { ...one.analysis, problems: one.problems },
      problem: null,
      bindings: one.bindings,
      override: comfy.overrides[one.file] ?? {},
      role: one.role,
      roleByHand: one.roleByHand,
      isDefault: chosen.get(one.role)?.file === one.file
    })),
    ...result.broken.map((one) => ({
      file: one.file,
      name: one.name,
      analysis: null,
      problem: one.problem,
      bindings: noBindings(),
      override: comfy.overrides[one.file] ?? {},
      role: 'creates' as WorkflowRole,
      roleByHand: false,
      isDefault: false
    }))
  ].sort((a, b) => a.file.localeCompare(b.file))

  return { ok: result.ok, dir, message: result.message, workflows }
}

/**
 * Which workflow of a role is used when none is named.
 *
 * The author's choice when they have made one and it is still there; the first
 * of that kind otherwise. Falling back rather than refusing matters because the
 * folder is a folder — a workflow can be renamed or removed with the app shut,
 * and a stale name in the settings should not stop the next request.
 */
export function defaultFor(
  loaded: LoadedWorkflow[],
  role: WorkflowRole,
  chosen: string | undefined
): LoadedWorkflow | null {
  const ofRole = loaded.filter((one) => one.role === role)
  return ofRole.find((one) => one.file === chosen) ?? ofRole[0] ?? null
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

/**
 * Which workflow the assistant meant.
 *
 * Named, it is forgiving in the three ways a model gets a file name slightly
 * wrong — the wrong case, the extension left on, only the first half typed —
 * and refuses rather than guessing when the answer is genuinely ambiguous.
 *
 * Unnamed, it takes the default for the role the request needs, which is the
 * author's choice or simply the first of that kind. It used to refuse whenever
 * there was more than one, which made every request name a workflow to say
 * something the author had already decided once.
 *
 * A named workflow of the wrong role is refused rather than run: a workflow
 * that makes a picture from nothing has nowhere to put the picture it was
 * given, and would quietly ignore it.
 */
export function resolveWorkflow(
  loaded: LoadedWorkflow[],
  asked: string,
  want: { role: WorkflowRole; default: string | undefined }
): { workflow: LoadedWorkflow | null; problem: string | null } {
  if (loaded.length === 0) {
    return { workflow: null, problem: 'No workflow in that folder could be read.' }
  }

  const ofRole = loaded.filter((one) => one.role === want.role)
  const names = ofRole.map((one) => one.name).join(', ')

  const wanted = asked.trim().replace(/\.json$/i, '')

  if (wanted.length === 0) {
    const chosen = defaultFor(loaded, want.role, want.default)
    if (chosen) return { workflow: chosen, problem: null }

    return {
      workflow: null,
      problem:
        want.role === 'edits'
          ? `No workflow here edits a picture — they all make one from nothing. Export one from ComfyUI that loads an image, or mark an existing one as "${ROLE_LABELS.edits}" in Settings → ComfyUI.`
          : `No workflow here makes a picture from nothing; they all edit one. Export one from ComfyUI, or mark an existing one as "${ROLE_LABELS.creates}" in Settings → ComfyUI.`
    }
  }

  // Named but of the other kind: say so rather than running the wrong one.
  const mistaken = loaded.find(
    (one) => one.role !== want.role && one.name.toLowerCase() === wanted.toLowerCase()
  )
  if (mistaken && !ofRole.some((one) => one.name.toLowerCase() === wanted.toLowerCase())) {
    return {
      workflow: null,
      problem: `"${mistaken.name}" ${mistaken.role === 'edits' ? 'edits a picture it is given' : 'makes a picture from nothing'}, which is not what this needs. ${names.length > 0 ? `These are: ${names}.` : 'There is no workflow of the right kind.'}`
    }
  }

  const exact = ofRole.find((one) => one.name === wanted)
  if (exact) return { workflow: exact, problem: null }

  const insensitive = ofRole.filter((one) => one.name.toLowerCase() === wanted.toLowerCase())
  if (insensitive.length === 1) return { workflow: insensitive[0]!, problem: null }

  const prefixed = ofRole.filter((one) => one.name.toLowerCase().startsWith(wanted.toLowerCase()))
  if (prefixed.length === 1) return { workflow: prefixed[0]!, problem: null }
  if (prefixed.length > 1) {
    return {
      workflow: null,
      problem: `"${asked}" could be any of ${prefixed.map((one) => one.name).join(', ')}. Use the whole name.`
    }
  }

  return { workflow: null, problem: `There is no workflow called "${asked}". These are available: ${names}.` }
}
