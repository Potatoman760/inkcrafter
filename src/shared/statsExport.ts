import {
  INVENTORY,
  itemsInCategory,
  type CustomField,
  type StatKind,
  type StatsDocument
} from './statsDoc'
import { listName } from './statsInk'
import type {
  CatalogueExport,
  ExportedCategory,
  ExportedItem,
  ExportedStat,
  ExportedVariable
} from './bundle/catalogue'

/**
 * Building the catalogue a game reads.
 *
 * The shape itself lives in `bundle/catalogue.ts`, which is shared with the
 * player; this is the half that knows about the authoring model and turns one
 * into the other.
 */

export const EXPORT_FILE = 'export/catalogue.json'

/** Engine-facing type names, rather than the app's internal `StatKind`. */
const TYPE_NAMES: Record<StatKind, string> = {
  number: 'int',
  boolean: 'bool',
  text: 'string'
}

export type { CatalogueExport, ExportedCategory, ExportedItem, ExportedStat, ExportedVariable }

/**
 * Custom pairs as an object rather than an array.
 *
 * The array is the right shape for editing — order is stable and a half-typed
 * label is not a key collision — and an object is the right shape for reading.
 * The conversion happens once, here. A later pair wins a duplicated label, which
 * is the same rule an object literal follows.
 */
function customAsObject(custom: CustomField[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (const field of custom) {
    const label = field.label.trim()
    if (label.length > 0) record[label] = field.value
  }
  return record
}

export function buildExport(doc: StatsDocument): CatalogueExport {
  // Only categories with items are exported, matching the ink: an empty category
  // generates no LIST, so exporting it would name a list the story does not have.
  const stocked = doc.categories.filter((category) => itemsInCategory(doc, category).length > 0)

  return {
    version: 1,
    generatedBy: 'InkCrafter',
    inventoryVariable: INVENTORY,
    stats: doc.stats.map((stat) => ({
      name: stat.name,
      type: TYPE_NAMES[stat.kind],
      default: stat.initial,
      min: stat.min,
      max: stat.max,
      display: stat.display,
      blurb: stat.blurb,
      icon: stat.icon,
      custom: customAsObject(stat.custom)
    })),
    variables: doc.variables.map((variable) => ({
      name: variable.name,
      type: TYPE_NAMES[variable.kind],
      default: variable.initial,
      min: variable.min,
      max: variable.max
    })),
    categories: stocked.map((category) => ({ name: category, list: listName(category) })),
    items: stocked.flatMap((category) =>
      itemsInCategory(doc, category).map((item) => ({
        name: item.name,
        category,
        list: listName(category),
        display: item.display,
        blurb: item.blurb,
        icon: item.icon,
        custom: customAsObject(item.custom)
      }))
    )
  }
}

export function serialiseExport(catalogue: CatalogueExport): string {
  return `${JSON.stringify(catalogue, null, 2)}\n`
}
