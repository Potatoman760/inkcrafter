import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ID_PREFIXES, newId, type IdPrefix } from '@shared/ids'
import type { Project } from '@shared/project'
import { stripBom } from '../text'
import {
  ALLOWED_EXTENSIONS,
  assertWritableExtension,
  resolveInWorkspace,
  workspaceRelative,
  WorkspacePathError
} from './workspacePath'

/**
 * What the assistant can actually do.
 *
 * Four tools, kept deliberately few. A model given twenty narrow tools spends
 * its turns choosing between them; a model given read, write, list and an id
 * generator can build anything in the workspace, because the workspace is only
 * files.
 *
 * Every one of them is confined by `resolveInWorkspace`, and writes are further
 * limited to the extensions the app understands — there is no reason for the
 * assistant to be able to drop a `.js` into the user's data directory.
 */

/**
 * How much of a file comes back.
 *
 * Comfortably more than any ink chapter, plan or codex entry, and deliberately
 * far below what a prompt can hold — a read result stays in the conversation and
 * is resent on every later round, so an over-generous limit here is paid for
 * repeatedly rather than once.
 */
const MAX_READ_BYTES = 24_000
const MAX_WRITE_BYTES = 400_000

/** Guards against a model that lists a directory of ten thousand files. */
const MAX_ENTRIES = 400

export interface ToolContext {
  root: string
  /** Collected so the UI can refresh whatever the assistant touched. */
  written: string[]
  /**
   * The project the author has open, when there is one. Carried here rather
   * than passed per call because the catalogue tools all act on it, and one of
   * them can change it — linking a codex library rewrites the manifest.
   */
  project: Project | null
  /**
   * Said by a tool that is still working, so a long one can show something
   * other than a stopped clock.
   *
   * Optional because every tool here is instant: a file write is a file write.
   * The one that is not is drawing a picture, which takes a minute of somebody
   * else's GPU and would otherwise look exactly like a hang.
   *
   * A tool that can block for that long must also own its own deadline. The
   * loop below awaits each call and has no timeout of its own, so nothing else
   * is going to end it.
   */
  onProgress?: (note: string) => void
}

export interface ToolResult {
  ok: boolean
  /** One line for the transcript. */
  summary: string
  /** What goes back to the model. */
  content: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  run: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string') throw new WorkspacePathError(`${name} must be a string.`)
  return value
}

async function listDirectory(root: string, path: string): Promise<string[]> {
  const absolute = path === '' ? root : resolveInWorkspace(root, path)
  const found: string[] = []

  async function walk(directory: string, depth: number): Promise<void> {
    if (found.length >= MAX_ENTRIES || depth > 6) return

    let contents
    try {
      contents = await readdir(directory, { withFileTypes: true })
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return
      throw cause
    }

    for (const item of contents.sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= MAX_ENTRIES) return
      if (item.name.startsWith('.')) continue

      const child = join(directory, item.name)
      if (item.isDirectory()) {
        found.push(`${workspaceRelative(root, child)}/`)
        await walk(child, depth + 1)
      } else {
        found.push(workspaceRelative(root, child))
      }
    }
  }

  await walk(absolute, 0)
  return found
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'list_files',
    description:
      'List files and folders in the workspace. Call this before writing anything, to see what already exists. Omit `path` to list the whole workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-relative folder, e.g. "projects/the-lighthouse". Omit for the root.'
        }
      }
    },
    async run(args, context) {
      const path = typeof args['path'] === 'string' ? args['path'].trim() : ''
      const entries = await listDirectory(context.root, path === '.' ? '' : path)

      if (entries.length === 0) {
        return {
          ok: true,
          summary: `listed ${path || 'the workspace'} — empty`,
          content: `${path || 'The workspace'} is empty.`
        }
      }

      const capped = entries.length >= MAX_ENTRIES
      return {
        ok: true,
        summary: `listed ${path || 'the workspace'} — ${entries.length} entries`,
        content: entries.join('\n') + (capped ? `\n…truncated at ${MAX_ENTRIES} entries.` : '')
      }
    }
  },

  {
    name: 'read_file',
    description: 'Read a file from the workspace. Read a file before rewriting it.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-relative file, e.g. "projects/the-lighthouse/plan.json".'
        }
      },
      required: ['path']
    },
    async run(args, context) {
      const path = stringArg(args, 'path')
      const absolute = resolveInWorkspace(context.root, path)

      let contents: string
      try {
        contents = stripBom(await readFile(absolute, 'utf8'))
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code
        const why = code === 'ENOENT' ? 'It does not exist.' : String(cause)
        return { ok: false, summary: `could not read ${path}`, content: `Could not read ${path}. ${why}` }
      }

      const truncated = contents.length > MAX_READ_BYTES
      return {
        ok: true,
        summary: `read ${path} (${contents.length} chars${truncated ? ', truncated' : ''})`,
        content: truncated ? `${contents.slice(0, MAX_READ_BYTES)}\n…truncated.` : contents
      }
    }
  },

  {
    name: 'write_file',
    description: `Write a file into the workspace, creating any folders it needs. Only ${ALLOWED_EXTENSIONS.join(', ')} files can be written. Writing over an existing file needs overwrite: true, so read it first and be sure.`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-relative file, e.g. "projects/my-story/ink/chapter-one.ink".'
        },
        contents: { type: 'string', description: 'The complete contents of the file.' },
        overwrite: {
          type: 'boolean',
          description: 'Required to replace a file that already exists. Defaults to false.'
        }
      },
      required: ['path', 'contents']
    },
    async run(args, context) {
      const path = stringArg(args, 'path')
      const contents = stringArg(args, 'contents')
      const overwrite = args['overwrite'] === true

      const absolute = resolveInWorkspace(context.root, path)
      assertWritableExtension(path)

      const owned = ownedByATool(path)
      if (owned) return owned

      if (contents.length > MAX_WRITE_BYTES) {
        return {
          ok: false,
          summary: `refused ${path} — too large`,
          content: `Refused: ${contents.length} characters is larger than the ${MAX_WRITE_BYTES} limit. Split it across files.`
        }
      }

      const existed = await stat(absolute).then(
        (info) => info.isFile(),
        () => false
      )

      if (existed && !overwrite) {
        return {
          ok: false,
          summary: `refused ${path} — already exists`,
          content: `Refused: ${path} already exists. Read it first, then call write_file again with overwrite: true if you really mean to replace it.`
        }
      }

      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, contents, 'utf8')
      context.written.push(workspaceRelative(context.root, absolute))

      return {
        ok: true,
        summary: `${existed ? 'replaced' : 'wrote'} ${path} (${contents.length} chars)`,
        content: `${existed ? 'Replaced' : 'Wrote'} ${path}.`
      }
    }
  },

  {
    name: 'new_id',
    description:
      'Generate one identifier of the kind the app uses. Never invent these by hand — a malformed id breaks the links between a project, its plan and the codex.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: [...ID_PREFIXES],
          description: 'prj for a project, lib for a codex library, cdx for a codex entry, pln for a plan node.'
        },
        count: { type: 'number', description: 'How many to generate, up to 50. Defaults to 1.' }
      },
      required: ['kind']
    },
    async run(args) {
      const kind = stringArg(args, 'kind') as IdPrefix
      if (!ID_PREFIXES.includes(kind)) {
        return {
          ok: false,
          summary: `unknown id kind ${kind}`,
          content: `Unknown kind ${kind}. Use one of ${ID_PREFIXES.join(', ')}.`
        }
      }

      const asked = typeof args['count'] === 'number' ? Math.floor(args['count']) : 1
      const count = Math.min(Math.max(asked, 1), 50)
      const ids = Array.from({ length: count }, () => newId(kind))

      return {
        ok: true,
        summary: `generated ${count} ${kind} id${count === 1 ? '' : 's'}`,
        content: ids.join('\n')
      }
    }
  }
]

/**
 * Files another tool owns, and what to use instead.
 *
 * `ink/state.ink` is generated and would be overwritten on the next save;
 * `stats.json` and `npcs.json` on their own declare nothing, because the
 * declarations live in that generated file. All of them fail quietly if written
 * by hand, so the refusal names the tool that does it properly rather than
 * letting it through.
 *
 * Only these. `plan.json`, `map.json` and `media.json` are ordinary documents —
 * nothing is generated from them, so a file write is a real option even where
 * the tool is the better one.
 */
function ownedByATool(path: string): ToolResult | null {
  const lower = path.toLowerCase()
  const named = (file: string): boolean => lower.endsWith(`/${file}`) || lower === file

  const owner = lower.endsWith('/state.ink')
    ? 'write_variables, which regenerates it'
    : named('stats.json')
      ? 'write_variables, which also regenerates the ink/state.ink the declarations live in'
      : named('npcs.json')
        ? 'write_cast, which also regenerates the ink/state.ink the declarations live in'
        : named('catalogue.json')
          ? 'write_variables, which regenerates it'
          : null

  if (!owner) return null

  return {
    ok: false,
    summary: `refused ${path} — generated`,
    content: `Refused: ${path} is generated. Use ${owner}.`
  }
}

export function toolSchemas(tools: ToolDefinition[] = TOOLS): unknown[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters }
  }))
}

/**
 * Runs one tool call. A failure is returned to the model as text rather than
 * thrown: a refused path or a missing file is information it can act on, and a
 * turn that dies on the first mistake is far less useful than one that is told
 * what went wrong.
 */
export async function runTool(
  name: string,
  argumentsJson: string,
  context: ToolContext,
  tools: ToolDefinition[] = TOOLS
): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) {
    return {
      ok: false,
      summary: `unknown tool ${name}`,
      content: `There is no tool called ${name}. Available: ${tools.map((t) => t.name).join(', ')}.`
    }
  }

  let args: Record<string, unknown>
  try {
    const parsed: unknown = argumentsJson.trim().length === 0 ? {} : JSON.parse(argumentsJson)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('arguments must be a JSON object')
    }
    args = parsed as Record<string, unknown>
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause)
    return {
      ok: false,
      summary: `${name} — unreadable arguments`,
      content: `Could not read the arguments to ${name}: ${why}`
    }
  }

  try {
    return await tool.run(args, context)
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause)
    return { ok: false, summary: `${name} failed — ${why}`, content: why }
  }
}
