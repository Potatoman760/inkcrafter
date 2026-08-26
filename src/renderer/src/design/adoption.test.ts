import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { glob } from 'tinyglobby'

/**
 * The two things a CSS-only adoption cannot enforce.
 *
 * 1. That screens compose the design system's components rather than writing
 *    its class names by hand. A hand-written `ic-` class is a component that
 *    was not used, and it drifts the moment the component changes.
 * 2. That nothing in `design/` reaches the network. The packaged CSP
 *    (`electron.vite.config.ts`) forbids it, but `apply: 'build'` means the
 *    policy never runs under `npm run dev` — a violation passes every local
 *    check and fails silently in the shipped app. The kit's own `Icon.jsx`
 *    fetches its glyphs and its `fonts.css` imports from Google Fonts: the
 *    same trap twice already.
 */

const ROOT = join(__dirname, '..')

async function sourceFiles(pattern: string): Promise<string[]> {
  return glob(pattern, { cwd: ROOT, absolute: true })
}

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

const RENDERER = '/renderer/src/'

/** `src/renderer/src/...` contains src twice, so name it from the renderer down. */
function shortName(file: string): string {
  const posix = file.split('\\').join('/')
  return posix.slice(posix.indexOf(RENDERER) + RENDERER.length)
}

function inDesign(file: string): boolean {
  return file.split('\\').join('/').includes('/design/')
}

/** Line numbers are 1-based, to match what an editor shows. */
function linesMatching(source: string, pattern: RegExp): { line: number; text: string }[] {
  return source
    .split('\n')
    .map((text, index) => ({ line: index + 1, text }))
    .filter((entry) => pattern.test(entry.text))
}

/**
 * A hand-written `ic-` class is allowed only where the line above it says why.
 * The marker names the family, so the comment cannot drift onto the wrong one.
 */
function isExempt(lines: string[], index: number): boolean {
  const family = /ic-([a-z0-9]+)/.exec(lines[index] ?? '')?.[1]
  if (!family) return false
  // The reason can sit a few lines up: a JSX comment wraps, and a prop line
  // is not always the first line of the element.
  return lines
    .slice(Math.max(0, index - 5), index)
    .some((line) => line.includes(`ic-${family} exception`))
}

describe('design system adoption', () => {
  it('no screen writes an ic- class name by hand', async () => {
    const files = await sourceFiles('**/*.tsx')
    const offenders: string[] = []

    for (const file of files) {
      // design/components is where the class names are supposed to be written.
      if (inDesign(file)) continue
      if (file.endsWith('.test.tsx')) continue

      const lines = read(file).split('\n')
      lines.forEach((text, index) => {
        if (!/className=.*\bic-[a-z0-9-]+/.test(text)) return
        if (isExempt(lines, index)) return
        offenders.push(`${shortName(file)}:${index + 1}  ${text.trim()}`)
      })
    }

    expect(offenders, 'use the component, or say why not on the line above').toEqual([])
  })

  it('every exception names the family it is excusing', async () => {
    const files = await sourceFiles('**/*.tsx')
    const stranded: string[] = []

    for (const file of files) {
      if (inDesign(file)) continue
      const source = read(file)
      for (const { line, text } of linesMatching(source, /ic-[a-z0-9]+ exception/)) {
        const family = /ic-([a-z0-9]+) exception/.exec(text)?.[1]
        const after = source.split('\n').slice(line, line + 6).join('\n')
        if (family && new RegExp(`ic-${family}`).test(after)) continue
        stranded.push(`${shortName(file)}:${line}`)
      }
    }

    // An exception left behind after the code it excused was converted reads
    // as permission that is no longer needed.
    expect(stranded, 'an exception with nothing under it').toEqual([])
  })

  it('nothing in design/ reaches the network', async () => {
    const files = await sourceFiles('design/**/*.{tsx,ts,css}')
    expect(files.length).toBeGreaterThan(10)

    const offenders: string[] = []
    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
      const source = read(file)
      const banned: [RegExp, string][] = [
        [/\bfetch\s*\(/, 'fetch()'],
        [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
        [/https?:\/\//, 'an absolute URL'],
        [/@import\s+url\(/, '@import url()'],
        [/new URL\([^)]*import\.meta\.url/, 'a runtime URL']
      ]
      for (const [pattern, what] of banned) {
        for (const { line } of linesMatching(source, pattern)) {
          offenders.push(`${shortName(file)}:${line} — ${what}`)
        }
      }
    }

    expect(offenders, 'the packaged CSP blocks this, and only in the package').toEqual([])
  })

  /**
   * The other half of the same trap, from the other direction.
   *
   * The media folder is served over `app:`, and every kind of thing it serves
   * needs its own directive: pictures are `img-src`, clips are `media-src`.
   * `media-src` was missing for as long as nothing tried to play a clip, and
   * the omission was invisible — dev injects no policy at all, so the video
   * worked locally and was refused only once packaged.
   */
  it('the packaged CSP lets the media scheme serve everything it serves', () => {
    const config = readFileSync(join(ROOT, '..', '..', '..', 'electron.vite.config.ts'), 'utf8')
    const csp = config.slice(config.indexOf('const CSP'), config.indexOf('].join'))

    for (const directive of ['img-src', 'media-src']) {
      const line = csp.split(String.fromCharCode(10)).find((one) => one.includes('"' + directive))
      expect(line, `${directive} is not in the policy`).toBeDefined()
      expect(line, `${directive} does not allow the app: scheme`).toContain('app:')
    }
  })
})
