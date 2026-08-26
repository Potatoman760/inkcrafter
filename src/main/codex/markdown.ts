import { isScalar, isSeq } from 'yaml'
import {
  CODEX_TYPES,
  type AiContext,
  type CodexDetail,
  type CodexEntry,
  type CodexType
} from '@shared/codex'
import { isIdOf, newId } from '@shared/ids'
import { parseDocument, serialiseDocument } from '../markdown'

/** Separates the model-visible description from the author's private notes. */
const NOTES_MARKER = '<!-- codex:notes -->'

const AI_CONTEXTS: readonly AiContext[] = ['always', 'detected', 'never']

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asType(value: unknown): CodexType {
  return CODEX_TYPES.includes(value as CodexType) ? (value as CodexType) : 'other'
}

function asAiContext(value: unknown, fallback: AiContext = 'detected'): AiContext {
  return AI_CONTEXTS.includes(value as AiContext) ? (value as AiContext) : fallback
}

function asDetails(value: unknown): CodexDetail[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const record = item as Record<string, unknown>
    const label = asString(record['label']).trim()
    if (label.length === 0) return []
    return [{ label, value: asString(record['value']), ai: asAiContext(record['ai'], 'always') }]
  })
}

export interface ParsedEntry {
  entry: CodexEntry
  /**
   * True when the file had no `id` and one was generated. The caller must write
   * the file back, or the entry would get a different id on every load and any
   * link to it would break.
   */
  generatedId: boolean
}

/**
 * Parses one entry file. `libraryId` and `file` come from where the file was
 * found; everything else comes from the file itself.
 */
export function parseEntry(libraryId: string, file: string, contents: string): ParsedEntry {
  const { data, body } = parseDocument(contents)

  const markerAt = body.indexOf(NOTES_MARKER)
  const description = (markerAt === -1 ? body : body.slice(0, markerAt)).trim()
  const notes = markerAt === -1 ? '' : body.slice(markerAt + NOTES_MARKER.length).trim()

  const tracking =
    typeof data['tracking'] === 'object' && data['tracking'] !== null
      ? (data['tracking'] as Record<string, unknown>)
      : {}

  const stored = asString(data['id'])
  const hasId = isIdOf(stored, 'cdx')

  return {
    generatedId: !hasId,
    entry: {
      id: hasId ? stored : newId('cdx'),
      libraryId,
      file,
      name: asString(data['name'], file.split('/').pop() ?? file),
      type: asType(data['type']),
      aliases: asStringArray(data['aliases']),
      tags: asStringArray(data['tags']),
      aiContext: asAiContext(data['aiContext']),
      tracking: {
        byName: asBoolean(tracking['byName'], true),
        caseSensitive: asBoolean(tracking['caseSensitive'], false),
        exclusions: asStringArray(tracking['exclusions'])
      },
      relations: asStringArray(data['relations']),
      details: asDetails(data['details']),
      appearance: asString(data['appearance']),
      description,
      notes
    }
  }
}

/**
 * `resolveName` turns a relation id into the entry's name, which is written as
 * a trailing YAML comment. The id is authoritative and the comment is
 * regenerated on every write, so it cannot drift out of date, and it is ignored
 * on read. Without it the frontmatter would be a column of opaque ids.
 */
export function serialiseEntry(
  entry: CodexEntry,
  resolveName: (relationId: string) => string | undefined = () => undefined
): string {
  const body =
    entry.notes.trim().length > 0
      ? `${entry.description.trim()}\n\n${NOTES_MARKER}\n\n${entry.notes.trim()}`
      : entry.description.trim()

  return serialiseDocument(
    {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      aliases: entry.aliases,
      tags: entry.tags,
      aiContext: entry.aiContext,
      tracking: {
        byName: entry.tracking.byName,
        caseSensitive: entry.tracking.caseSensitive,
        exclusions: entry.tracking.exclusions
      },
      relations: entry.relations,
      ...(entry.appearance.trim().length > 0 ? { appearance: entry.appearance } : {}),
      details: entry.details.map((detail) => ({
        label: detail.label,
        value: detail.value,
        ai: detail.ai
      }))
    },
    body,
    (document) => {
      const relations = document.get('relations', true)
      if (!isSeq(relations)) return
      for (const item of relations.items) {
        if (!isScalar(item) || typeof item.value !== 'string') continue
        const name = resolveName(item.value)
        if (name) item.comment = ` ${name}`
      }
    }
  )
}
