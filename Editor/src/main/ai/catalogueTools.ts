import { CODEX_TYPES, newEntry, slugify, type CodexEntry, type CodexType } from '@shared/codex'
import { restamp } from '@shared/modified'
import {
  inkName,
  newItem,
  newStat,
  newVariable,
  STAT_KINDS,
  type Item,
  type Stat,
  type StatKind,
  type StatsDocument,
  type Variable
} from '@shared/statsDoc'
import type { CodexLibrary, Project } from '@shared/project'
import { createLibrary, listLibraries, loadEntries, saveEntry } from '../codex/library'
import { readProject, saveProject } from '../project'
import { readStats, writeStats } from '../stats'
import { librariesDir } from '../workspace'
import { asStringList, asText, needProject, projectFolder } from './toolInput'
import type { ToolDefinition, ToolResult } from './workspaceTools'

/**
 * Tools for the two catalogues the assistant cannot correctly write by hand.
 *
 * Everything else it does is a file write, deliberately — the workspace is only
 * files, and four broad tools beat twenty narrow ones. These two exist because
 * writing the file is *not enough*, and getting that wrong fails silently:
 *
 * - `stats.json` on its own declares nothing. The `VAR` and `LIST` lines live in
 *   a generated `ink/state.ink`, and the entry point has to INCLUDE it. A model
 *   that writes the catalogue and stops leaves a story that cannot see any of
 *   it, and nothing says so until a condition fails to compile.
 * - A codex entry needs a library that exists, an id that is unique, and the
 *   project to actually *link* that library. Three files, one of them outside
 *   the project, and an entry in an unlinked library is simply never loaded.
 *
 * Both merge rather than replace. There is no undo in this workspace, and a
 * model that omits a field should not thereby delete a character.
 */

/* Stats, hidden vars and items --------------------------------------------- */

interface StatInput {
  name: string
  kind: StatKind
  initial: number | boolean | string
  display: string
  blurb: string
  description: string
}

function readStatInput(value: unknown): StatInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const name = inkName(asText(record['name']))
  if (name.length === 0) return null

  const kind = STAT_KINDS.includes(record['kind'] as StatKind)
    ? (record['kind'] as StatKind)
    : 'number'

  const raw = record['initial']
  const given = typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'string'
  const fallback = kind === 'boolean' ? false : kind === 'text' ? '' : 0

  return {
    name,
    kind,
    initial: given ? (raw as number | boolean | string) : fallback,
    display: asText(record['display']) || asText(record['name']).trim(),
    blurb: asText(record['blurb']),
    description: asText(record['description'])
  }
}

interface ItemInput {
  name: string
  display: string
  blurb: string
  description: string
}

function readItemInput(value: unknown): ItemInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const name = inkName(asText(record['name']))
  if (name.length === 0) return null

  return {
    name,
    display: asText(record['display']) || asText(record['name']).trim(),
    blurb: asText(record['blurb']),
    description: asText(record['description'])
  }
}

/** Merges by ink name: an existing entry is updated, a new one appended. */
function mergeStat(doc: StatsDocument, input: StatInput): { doc: StatsDocument; added: boolean } {
  const existing = doc.stats.find((stat) => stat.name === input.name)

  if (existing) {
    // Stamped through the same guard the panels use: the assistant rewriting
    // an entry with what it already said is not a change to it.
    const updated: Stat = restamp(existing, { ...existing, ...input })
    return {
      doc: { ...doc, stats: doc.stats.map((stat) => (stat.id === existing.id ? updated : stat)) },
      added: false
    }
  }

  const stat: Stat = { ...newStat(input.display || input.name, input.kind), ...input }
  return { doc: { ...doc, stats: [...doc.stats, stat] }, added: true }
}

function mergeVariable(doc: StatsDocument, input: StatInput): { doc: StatsDocument; added: boolean } {
  const existing = doc.variables.find((variable) => variable.name === input.name)
  const fields: Omit<Variable, 'id'> = {
    name: input.name,
    kind: input.kind,
    initial: input.initial,
    min: existing?.min ?? null,
    max: existing?.max ?? null,
    description: input.description,
    modified: existing?.modified ?? null
  }

  if (existing) {
    return {
      doc: {
        ...doc,
        variables: doc.variables.map((variable) =>
          variable.id === existing.id ? restamp(existing, { ...existing, ...fields }) : variable
        )
      },
      added: false
    }
  }

  return {
    doc: { ...doc, variables: [...doc.variables, { ...newVariable(input.name, input.kind), ...fields }] },
    added: true
  }
}

function mergeItem(doc: StatsDocument, input: ItemInput): { doc: StatsDocument; added: boolean } {
  const existing = doc.items.find((item) => item.name === input.name)

  if (existing) {
    const updated: Item = restamp(existing, { ...existing, ...input })
    return {
      doc: { ...doc, items: doc.items.map((item) => (item.id === existing.id ? updated : item)) },
      added: false
    }
  }

  const item: Item = { ...newItem(input.display || input.name), ...input }
  return { doc: { ...doc, items: [...doc.items, item] }, added: true }
}

export const writeStatsTool: ToolDefinition = {
  name: 'write_variables',
  description:
    'Add or update player-visible stats, hidden story vars and carried items in the open project. Route by meaning: a distinct thing the player can acquire, carry, use, equip, give or lose is an item (ring, key, sword, potion), never a has_ring stat or var; a value deliberately shown on the player status screen is a stat; private story logic is a variable. Character-specific state belongs in write_cast. Use this rather than writing stats.json with write_file: the VAR and LIST declarations live in a generated ink/state.ink that only this regenerates. Merges with what is already there, so send only what is new or changed.',
  parameters: {
    type: 'object',
    properties: {
      variables: {
        type: 'array',
        description:
          'Hidden numbers, flags and text used only by story logic, e.g. met_queen, door_unlocked or chosen_route. Not carried objects: possession of a ring is the ring item, tested through inventory, not a has_ring variable.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'lower_snake_case, e.g. "strength".' },
            kind: { type: 'string', enum: [...STAT_KINDS] },
            initial: { description: 'Starting value: a number, true or false, or a string.' },
            description: { type: 'string', description: 'A note for the author; becomes a comment.' }
          },
          required: ['name']
        }
      },
      stats: {
        type: 'array',
        description:
          'Values deliberately shown to the player on the character or status screen, e.g. health, strength, reputation or numeric gold. Not inventory and not the default bucket for booleans.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'lower_snake_case, e.g. "strength".' },
            kind: { type: 'string', enum: [...STAT_KINDS] },
            initial: { description: 'Starting value: a number, true or false, or a string.' },
            display: { type: 'string', description: 'What a player sees, e.g. "Strength".' },
            blurb: { type: 'string', description: 'A sentence for the player.' },
            description: { type: 'string', description: 'A note for the author; becomes a comment.' }
          },
          required: ['name']
        }
      },
      items: {
        type: 'array',
        description:
          'Distinct things the player can acquire, carry, use, equip, give away or lose, e.g. ring, brass_key, sword, potion, letter or quest token. Each becomes a member of the items LIST and possession is checked with {inventory ? item_name}.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'lower_snake_case, e.g. "brass_key".' },
            display: { type: 'string' },
            blurb: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['name']
        }
      }
    }
  },

  async run(args, context): Promise<ToolResult> {
    const project = needProject(context.project)
    let doc = await readStats(project)

    const variables = Array.isArray(args['variables'])
      ? args['variables'].map(readStatInput).filter((input): input is StatInput => input !== null)
      : []
    const stats = Array.isArray(args['stats'])
      ? args['stats'].map(readStatInput).filter((input): input is StatInput => input !== null)
      : []
    const items = Array.isArray(args['items'])
      ? args['items'].map(readItemInput).filter((input): input is ItemInput => input !== null)
      : []

    if (stats.length === 0 && variables.length === 0 && items.length === 0) {
      return {
        ok: false,
        summary: 'write_variables — nothing usable',
        content: 'No usable variables or items. Each needs a name.'
      }
    }

    let newStats = 0
    let newVariables = 0
    let newItems = 0

    for (const input of stats) {
      const result = mergeStat(doc, input)
      doc = result.doc
      if (result.added) newStats++
    }

    for (const input of variables) {
      const result = mergeVariable(doc, input)
      doc = result.doc
      if (result.added) newVariables++
    }

    for (const input of items) {
      const result = mergeItem(doc, input)
      doc = result.doc
      if (result.added) newItems++
    }

    const { written } = await writeStats(project, doc)
    for (const path of written) context.written.push(`${projectFolder(project)}/${path}`)

    return {
      ok: true,
      summary: `variables: +${newStats} stat${newStats === 1 ? '' : 's'}, +${newVariables} var${newVariables === 1 ? '' : 's'}, +${newItems} item${newItems === 1 ? '' : 's'}`,
      content:
        `The catalogue now holds ${doc.stats.length} stat(s), ${doc.variables.length} hidden var(s), and ${doc.items.length} item(s). ` +
        'Declarations were regenerated into ink/state.ink and the entry point includes it, so the ' +
        'story can use them now: {strength >= 3} to gate on a variable, {inventory ? brass_key} on an item.'
    }
  }
}

/* Codex -------------------------------------------------------------------- */

/**
 * The library to write into: one the project already links, one matching the
 * name asked for, or a new one — linked either way.
 *
 * An entry in a library the project does not link is never loaded, so linking is
 * part of writing the entry rather than a separate step to forget.
 */
async function resolveLibrary(
  project: Project,
  wanted: string
): Promise<{ project: Project; library: CodexLibrary; created: boolean; linked: boolean }> {
  const libraries = await listLibraries(librariesDir())
  const title = wanted.trim()

  const found =
    title.length > 0
      ? libraries.find(
          (library) =>
            library.title.toLowerCase() === title.toLowerCase() ||
            slugify(library.title) === slugify(title)
        )
      : libraries.find((library) => project.libraries.includes(library.id))

  const library = found ?? (await createLibrary(librariesDir(), title || `${project.title} codex`))

  if (project.libraries.includes(library.id)) {
    return { project, library, created: found === undefined, linked: false }
  }

  const linkedProject: Project = { ...project, libraries: [...project.libraries, library.id] }
  await saveProject(linkedProject)

  return { project: linkedProject, library, created: found === undefined, linked: true }
}

export const writeCodexTool: ToolDefinition = {
  name: 'write_codex_entry',
  description:
    'Create or update a codex entry — a character, location, item, lore or route in the story bible. Use this rather than writing the markdown with write_file: it mints the id, files it in the right library, and links that library to the project, without which the entry is never loaded.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'What it is called, e.g. "Wren Calloway".' },
      type: { type: 'string', enum: [...CODEX_TYPES] },
      description: {
        type: 'string',
        description:
          'Markdown, and the part sent to a model later as established fact about this thing. Write it properly rather than as a placeholder.'
      },
      appearance: {
        type: 'string',
        description:
          'For a character only: their stable visual traits — face, build, hair, clothing and other details image-generation prompts should preserve.'
      },
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Other names the prose uses, so mentions of them are detected too.'
      },
      tags: { type: 'array', items: { type: 'string' } },
      library: {
        type: 'string',
        description: 'Which library to write into, by title. Defaults to the one the project links.'
      }
    },
    required: ['name', 'description']
  },

  async run(args, context): Promise<ToolResult> {
    const project = needProject(context.project)

    const name = asText(args['name']).trim()
    if (name.length === 0) {
      return { ok: false, summary: 'write_codex_entry — no name', content: 'An entry needs a name.' }
    }

    const type = CODEX_TYPES.includes(args['type'] as CodexType)
      ? (args['type'] as CodexType)
      : 'character'

    // Re-read: an earlier call in this same turn may have linked a library, and
    // the project held in the context would not know about it.
    const current = (await readProject(project.path)) ?? project
    const resolved = await resolveLibrary(current, asText(args['library']))
    context.project = resolved.project

    const entries = await loadEntries(resolved.library)
    const existing = entries.find(
      (candidate) => candidate.name.toLowerCase() === name.toLowerCase()
    )

    const entry: CodexEntry = existing
      ? { ...existing, name, type }
      : newEntry(resolved.library.id, name, type, `${type}s/${slugify(name)}`)

    entry.description = asText(args['description'])
    if (type === 'character' && Object.hasOwn(args, 'appearance')) {
      entry.appearance = asText(args['appearance'])
    }
    entry.aliases = asStringList(args['aliases'])
    entry.tags = asStringList(args['tags'])

    const names = Object.fromEntries(entries.map((candidate) => [candidate.id, candidate.name]))
    await saveEntry(resolved.library, entry, names)

    const folder = resolved.library.path.split(/[\\/]/).filter(Boolean).pop()
    context.written.push(`codex/${folder}/${entry.file}.md`)

    const notes = [
      resolved.created ? `in a new library "${resolved.library.title}"` : `in "${resolved.library.title}"`,
      resolved.linked ? 'which is now linked to the project' : ''
    ].filter(Boolean)

    return {
      ok: true,
      summary: `codex: ${existing ? 'updated' : 'created'} ${name} in ${resolved.library.title}`,
      content: `${existing ? 'Updated' : 'Created'} ${name} ${notes.join(', ')}.`
    }
  }
}
