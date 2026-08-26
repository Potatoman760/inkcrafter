import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WINDOW_BACKGROUND } from '@shared/theme'
import { SIDEBAR_DEFAULT, SIDE_DEFAULT, SPLITTER_WIDTH } from '../layout/dimensions'

/**
 * Three numbers and one colour exist in both TypeScript and the token CSS, and
 * neither can read the other: the CSS has to stand alone for the `ic-*` layer,
 * the window background is needed before any renderer exists, and the layout
 * defaults are pushed from TS at mount. They had already drifted once — the
 * stylesheet said 380px where App.tsx said 420 — so the copies are checked here
 * rather than by remembering.
 *
 * This reads the CSS off disk rather than importing it: Vitest stubs CSS
 * imports, and `?raw` on a stylesheet comes back as an empty string. That makes
 * it a node test, so tsconfig.web.json excludes it — see the note there.
 */
function token(file: string, name: string): string {
  const css = readFileSync(join(__dirname, 'tokens', file), 'utf8')
  const match = new RegExp(`${name}:\s*([^;]+);`).exec(css)
  if (!match?.[1]) throw new Error(`${name} is not declared in tokens/${file}`)
  return match[1].trim()
}

describe('design tokens agree with their TypeScript copies', () => {
  it('keeps the workspace column defaults in step', () => {
    expect(token('spacing.css', '--pane-sidebar-default')).toBe(`${SIDEBAR_DEFAULT}px`)
    expect(token('spacing.css', '--pane-side-default')).toBe(`${SIDE_DEFAULT}px`)
  })

  it('keeps the splitter width in step', () => {
    expect(token('spacing.css', '--splitter-width')).toBe(`${SPLITTER_WIDTH}px`)
  })

  it('paints the window in the same colour as --surface-canvas', () => {
    // --surface-canvas aliases --ink-1000; the window cannot resolve the alias.
    expect(token('colors.css', '--ink-1000')).toBe(WINDOW_BACKGROUND)
  })
})
