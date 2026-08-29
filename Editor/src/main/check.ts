import { join, sep } from 'node:path'
import { emptyGallery, parseGallery } from '@shared/bundle/galleryDoc'
import { emptyMap, parseMap } from '@shared/bundle/mapDoc'
import { emptyMinigames, parseMinigames } from '@shared/bundle/minigameDoc'
import { emptyNpcs, parseNpcs } from '@shared/bundle/npcDoc'
import { preflight } from '@shared/bundle/preflight'
import { emptyGame, parseGame } from '@shared/bundle/gameDoc'
import { emptyMedia, parseMedia } from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import { emptyStats, parseStats } from '@shared/statsDoc'
import type { ProjectCheck } from '@shared/types'
import { destinationsIn, measureHotspots, readDoc, readSources } from './bundle'
import { compileStory } from './ink/compiler'

/**
 * Everything wrong with the project, without exporting it.
 *
 * Two halves that fail differently. The compiler answers whether the ink is
 * *ink* — a missing divert target, a malformed choice — and it is the only half
 * the editor used to show. The other half is `preflight`, which answers whether
 * the story's tags name things that exist: a `# char: wren/furious` compiles
 * perfectly and is a blank stage at runtime, because ink has no opinion about
 * what is in `media.json`.
 *
 * That second half ran only on the way out, in `exportBundle`, so the first
 * time an author heard about a misspelled sprite was when they exported. This
 * is the same check, callable on demand, and it deliberately reuses the
 * export's own readers so the two cannot drift into different answers.
 *
 * Whole-project by construction: the compile starts at the entry point and
 * follows every INCLUDE, and preflight is handed the sources that compile
 * touched rather than the file that happens to be open.
 */
export async function checkProject(project: Project): Promise<ProjectCheck> {
  const entry = join(project.path, project.main.split('/').join(sep))
  const { diagnostics, filesRead } = compileStory({ filePath: entry }, { countAllVisits: true })

  const [stats, media, npcs, map, gallery, minigames, game] = await Promise.all([
    readDoc(project, 'stats.json', parseStats, emptyStats),
    readDoc(project, 'media.json', parseMedia, emptyMedia),
    readDoc(project, 'npcs.json', parseNpcs, emptyNpcs),
    readDoc(project, 'map.json', parseMap, emptyMap),
    readDoc(project, 'gallery.json', parseGallery, emptyGallery),
    readDoc(project, 'minigames.json', parseMinigames, emptyMinigames),
    readDoc(project, 'game.json', parseGame, emptyGame)
  ])

  const sources = await readSources(project, filesRead)
  const knots = destinationsIn(sources)
  const sizes = await measureHotspots(project, media)

  return {
    diagnostics,
    problems: preflight({ sources, media, stats, npcs, map, gallery, minigames, game, knots, sizes }),
    files: sources.size
  }
}
