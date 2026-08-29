// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

/**
 * The catalogue as a game reads it — types only.
 *
 * Split out of `statsExport.ts` so a player can share these definitions without
 * also taking the editor's authoring model, its ink generator and its id
 * machinery along with them. `statsExport.ts` builds one of these from a
 * `StatsDocument`; nothing here knows that document exists.
 *
 * The point of the file on disk is the *join* with the compiled story.
 * `Story.ToJson()` already writes a `listDefs` map holding every category and
 * every item name, so an engine loading the story has the vocabulary already.
 * What it has no way to get is the half that never reaches the ink at all —
 * display names, blurbs, icons, the clamps a game enforces — plus the stats,
 * whose names and types survive only as bytecode inside the `global decl`
 * container.
 *
 *     story.json  listDefs: { "Tools": { "shovel": 1, … } }
 *                                ▲            ▲
 *     catalogue.json  items: [{ list, name, display, icon, … }]
 */

/** Engine-facing type names, rather than the app's internal `StatKind`. */
export type ExportedStatType = 'int' | 'bool' | 'string'

export interface ExportedVariable {
  name: string
  type: string
  default: number | boolean | string
  /** The range the game clamps changes to, or null for unbounded. */
  min: number | null
  max: number | null
}

/** A variable intentionally exposed to the player. */
export interface ExportedStat extends ExportedVariable {
  display: string
  blurb: string
  icon: string
  custom: Record<string, string>
}

export interface ExportedCategory {
  name: string
  /** The ink `LIST` identifier, which is the key in the story's `listDefs`. */
  list: string
}

export interface ExportedItem extends ExportedCategory {
  category: string
  display: string
  blurb: string
  icon: string
  custom: Record<string, string>
}

export interface CatalogueExport {
  version: 1
  generatedBy: 'InkCrafter'
  /** The ink variable the game reads to know what is carried. */
  inventoryVariable: string
  stats: ExportedStat[]
  /** Story-only variables. Runtime systems may change them, but UI must not list them. */
  variables: ExportedVariable[]
  categories: ExportedCategory[]
  items: ExportedItem[]
}

export function emptyCatalogue(): CatalogueExport {
  return {
    version: 1,
    generatedBy: 'InkCrafter',
    inventoryVariable: 'inventory',
    stats: [],
    variables: [],
    categories: [],
    items: []
  }
}

/** Reads a catalogue, tolerating anything, like every other document reader. */
export function parseCatalogue(json: string): CatalogueExport {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyCatalogue()
    const record = parsed as Record<string, unknown>

    const list = <T>(key: string): T[] => (Array.isArray(record[key]) ? (record[key] as T[]) : [])

    return {
      version: 1,
      generatedBy: 'InkCrafter',
      inventoryVariable:
        typeof record['inventoryVariable'] === 'string' && record['inventoryVariable'].length > 0
          ? record['inventoryVariable']
          : 'inventory',
      stats: list<ExportedStat>('stats'),
      variables: list<ExportedVariable>('variables'),
      categories: list<ExportedCategory>('categories'),
      items: list<ExportedItem>('items')
    }
  } catch {
    return emptyCatalogue()
  }
}
