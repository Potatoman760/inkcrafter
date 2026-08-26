import { readFile } from 'node:fs/promises'
import type { Project } from '@shared/project'
import { STATE_FILE } from '@shared/statsInk'
import type { NameUse } from '@shared/types'
import { listInkFiles } from './project'
import { stripBom } from './text'

/**
 * Where an identifier is used in a project's ink.
 *
 * Renaming a stat or an item changes what the generated declarations say, and
 * every line of ink already using the old name stops compiling. The app cannot
 * safely rewrite those lines yet — telling a `shovel` in a condition from the
 * word "shovel" in a sentence needs the prose/code split that
 * [mentions.ts](../shared/mentions.ts) has and this does not use — so instead it
 * says exactly where to look.
 *
 * That is the honest trade for now. Renaming into a broken build with no warning
 * would be the bad outcome; renaming with an accurate list of what to fix is
 * useful today and does not pretend to more precision than it has.
 */

/** Matches the identifier only on its own, not inside a longer word. */
function matcher(name: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`)
}

/**
 * Every line of the project's ink mentioning `name`.
 *
 * `ink/state.ink` is skipped: it is generated, it always mentions the name, and
 * it is rewritten by the same save that does the rename — reporting it would be
 * telling the author to fix the one file that fixes itself.
 */
export async function findNameUses(project: Project, name: string): Promise<NameUse[]> {
  if (name.trim().length === 0) return []

  const pattern = matcher(name.trim())
  const files = (await listInkFiles(project)).filter((file) => file.path !== STATE_FILE)

  const found = await Promise.all(
    files.map(async (file): Promise<NameUse[]> => {
      let contents: string
      try {
        contents = stripBom(await readFile(file.absolutePath, 'utf8'))
      } catch {
        // A file listed but unreadable is not worth failing a rename over.
        return []
      }

      return contents
        .split(/\r?\n/)
        .flatMap((text, index) =>
          pattern.test(text) ? [{ path: file.path, line: index + 1, text: text.trim() }] : []
        )
    })
  )

  return found.flat()
}
