import {
  emptyPlan,
  newPlanNode,
  planFromMarkdown,
  PLAN_STATUSES,
  type PlanDocument,
  type PlanNode,
  type PlanStatus
} from '@shared/planDoc'
import { readPlan, writePlanWithResult } from '../plan'
import { asStringList, asText, needProject, projectFolder } from './toolInput'
import type { ToolDefinition, ToolResult } from './workspaceTools'

/**
 * The plan.
 *
 * `plan.json` is an ordinary document and `write_file` can produce a valid one,
 * so this is the tool that earns its place least — except for the ids. Every
 * node carries a `pln_` id that the plan grid, the structure panel and every
 * file attachment link through, and a model writing the file by hand has to
 * mint one per node and keep them unique across a tree it is also rearranging.
 * One repeated id silently makes two sections the same section.
 *
 * It also takes markdown, which is how a plan is meant to get in — the same
 * parser the paste-an-outline dialog uses, so "outline my story" lands in the
 * shape the app already knows how to read.
 *
 * Merging is by title within a parent, because that is the only handle a model
 * has. Replacing is possible but has to be asked for: there is no undo here.
 */

interface NodeInput {
  title: string
  summary: string
  status: PlanStatus | null
  tags: string[]
  knot: string | null
  children: NodeInput[]
}

function readNodeInput(value: unknown, depth: number): NodeInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const title = asText(record['title']).trim()
  if (title.length === 0) return null

  const status = PLAN_STATUSES.includes(record['status'] as PlanStatus)
    ? (record['status'] as PlanStatus)
    : null

  const knot = asText(record['knot']).trim()

  return {
    title,
    summary: asText(record['summary']),
    status,
    tags: asStringList(record['tags']),
    knot: knot.length > 0 ? knot : null,
    // Acts hold chapters hold scenes, and that is the whole of it — a fourth
    // level has no name and nothing renders it, so it is dropped here rather
    // than written somewhere it would never be seen.
    children:
      depth >= 2
        ? []
        : Array.isArray(record['children'])
          ? record['children']
              .map((child) => readNodeInput(child, depth + 1))
              .filter((one): one is NodeInput => one !== null)
          : []
  }
}

/**
 * Merges one level of the tree by title, recursing into the children of a node
 * that was already there.
 */
function mergeLevel(existing: PlanNode[], incoming: NodeInput[]): { nodes: PlanNode[]; added: number } {
  let nodes = [...existing]
  let added = 0

  for (const input of incoming) {
    const at = nodes.findIndex((one) => one.title.toLowerCase() === input.title.toLowerCase())
    const was = at === -1 ? null : nodes[at]!

    const children = mergeLevel(was?.children ?? [], input.children)
    added += children.added

    const node: PlanNode = {
      // The id is the thing this tool exists for: kept when the node is already
      // there, minted once when it is not, never sent by the model at all.
      id: was?.id ?? newPlanNode(input.title).id,
      title: input.title,
      summary: input.summary || was?.summary || '',
      status: input.status ?? was?.status ?? null,
      tags: input.tags.length > 0 ? input.tags : (was?.tags ?? []),
      knot: input.knot ?? was?.knot ?? null,
      // Chapter folders are app-managed just like Scene file paths. A model
      // may reorganise prose, but cannot silently redirect where Ink is made.
      folder: was?.folder ?? null,
      // File ownership is not model-authored. The plan writer creates one for
      // every new Scene and preserves the app-managed path on an existing one.
      files: was?.files ?? [],
      children: children.nodes
    }

    if (was) nodes[at] = node
    else {
      nodes = [...nodes, node]
      added++
    }
  }

  return { nodes, added }
}

const NODE_SHAPE = {
  title: { type: 'string', description: 'The section’s name, e.g. "The Archive".' },
  summary: { type: 'string', description: 'What happens here, in a sentence or two.' },
  status: { type: 'string', enum: [...PLAN_STATUSES] },
  tags: { type: 'array', items: { type: 'string' } },
  knot: {
    type: 'string',
    description: 'Overrides the knot derived from the title. Omit unless it has to differ.'
  }
}

export const writePlanTool: ToolDefinition = {
  name: 'write_plan',
  description:
    'Write the open project’s plan — the acts, chapters and scenes the story is built from. Use this rather than writing plan.json with write_file: every node needs a unique pln_ id, and one repeated id silently makes two sections the same section. Send either `markdown` (a heading outline, the way the app imports one) or `nodes`. Merges by title, so send only what is new or changed, unless you pass replace.',
  parameters: {
    type: 'object',
    properties: {
      markdown: {
        type: 'string',
        description:
          'A heading outline: "# Act One" is an act, "## The door" a chapter, "### Inside" a scene, and the text under each is its summary. "status:" and "tags:" lines directly under a heading are read as fields.'
      },
      nodes: {
        type: 'array',
        description: 'The top level is acts. Nest chapters, then scenes, in children.',
        items: {
          type: 'object',
          properties: {
            ...NODE_SHAPE,
            children: {
              type: 'array',
              description: 'Chapters of this act.',
              items: {
                type: 'object',
                properties: {
                  ...NODE_SHAPE,
                  children: {
                    type: 'array',
                    description: 'Scenes of this chapter.',
                    items: { type: 'object', properties: NODE_SHAPE, required: ['title'] }
                  }
                },
                required: ['title']
              }
            }
          },
          required: ['title']
        }
      },
      notes: { type: 'string', description: 'Anything true of the story rather than a section.' },
      replace: {
        type: 'boolean',
        description:
          'Discard the existing plan instead of merging into it. There is no undo — only pass this when the author asked for the plan to be replaced.'
      }
    }
  },

  async run(args, context): Promise<ToolResult> {
    const project = needProject(context.project)

    const markdown = asText(args['markdown']).trim()
    const incoming: NodeInput[] =
      markdown.length > 0
        ? // Round-tripped through the app's own importer so a pasted outline and
          // a generated one cannot land differently.
          planFromMarkdown(markdown).nodes.map(toInput)
        : Array.isArray(args['nodes'])
          ? args['nodes']
              .map((node) => readNodeInput(node, 0))
              .filter((one): one is NodeInput => one !== null)
          : []

    const notes = asText(args['notes'])

    if (incoming.length === 0 && notes.length === 0) {
      return {
        ok: false,
        summary: 'write_plan — nothing usable',
        content:
          'No usable sections. Send `markdown` as a heading outline, or `nodes` where each has a title.'
      }
    }

    const replace = args['replace'] === true
    const current = replace ? emptyPlan() : await readPlan(project)
    const before = count(current.nodes)

    const merged = mergeLevel(current.nodes, incoming)
    const doc: PlanDocument = {
      ...current,
      notes: notes || current.notes,
      nodes: merged.nodes
    }

    const stored = await writePlanWithResult(project, doc)
    for (const path of stored.written) {
      context.written.push(`${projectFolder(project)}/${path}`)
    }

    const total = count(stored.plan.nodes)
    return {
      ok: true,
      summary: `plan: ${replace ? `replaced with ${total} section${total === 1 ? '' : 's'}` : `+${merged.added} section${merged.added === 1 ? '' : 's'}`}`,
      content:
        `The plan now holds ${total} section(s)${replace ? `, replacing the ${before} that were there` : ''}. ` +
        'Every Scene has one app-managed Ink file; its knot follows the Scene title unless knot overrides it.'
    }
  }
}

function count(nodes: PlanNode[]): number {
  return nodes.reduce((total, node) => total + 1 + count(node.children), 0)
}

/** A parsed node, back into the shape the merge takes. */
function toInput(node: PlanNode): NodeInput {
  return {
    title: node.title,
    summary: node.summary,
    status: node.status,
    tags: node.tags,
    knot: node.knot,
    children: node.children.map(toInput)
  }
}
