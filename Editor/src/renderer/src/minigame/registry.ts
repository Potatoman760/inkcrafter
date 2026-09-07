import { minigameModules } from '@shared/bundle/minigameDoc'
import type { MinigameEditor } from './module'

const files = import.meta.glob<{ default: MinigameEditor }>('./*/editor.tsx', { eager: true })
export const minigameEditors = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
  .map(([path, module]) => {
    if (path !== `./${module.default.kind}/editor.tsx`) throw new Error(`Minigame folder does not match its kind: ${path}`)
    return module.default
  }).sort((a, b) => a.order - b.order)
const kinds = new Set<string>()
for (const module of minigameEditors) {
  if (kinds.has(module.kind)) throw new Error(`Duplicate minigame editor: ${module.kind}`)
  if (!minigameModules.has(module.kind)) throw new Error(`Unknown minigame editor: ${module.kind}`)
  kinds.add(module.kind)
}
for (const kind of minigameModules.keys()) {
  if (!kinds.has(kind)) throw new Error(`Missing minigame editor: ${kind}`)
}
