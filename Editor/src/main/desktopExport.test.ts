import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DesktopPlatformInfo } from '@shared/desktop'
import type { Project } from '@shared/project'
import {
  DESKTOP_MARKER,
  exportDesktop,
  fileName,
  gameIdFor,
  setPlistString,
  type DesktopTools
} from './desktopExport'
import { exists } from './fs'

/**
 * The assembly, with the world stubbed out: Electron's zips are laid out by a
 * fake unzip, the player's build is a fake that says yes, and the player
 * checkout is a folder of placeholder files. What is real is the exporter
 * itself — the story is compiled and the bundle written — and what is read
 * back is the folder a reader would double-click.
 */

let root = ''
let out = ''
let player = ''
let project: Project

const ENTRY = `-> start

=== start ===
# bg: courtyard
The gate is shut.
-> END
`

/** The shape of Electron's Info.plist, as far as this cares. */
const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleExecutable</key>
\t<string>Electron</string>
\t<key>CFBundleIdentifier</key>
\t<string>com.github.Electron</string>
\t<key>CFBundleName</key>
\t<string>Electron</string>
</dict>
</plist>
`

/** What each zip holds, written straight into the folder as if unpacked. */
async function fakeUnzip(zip: string, dir: string): Promise<void> {
  const [, platform] = zip.split(':')
  await mkdir(dir, { recursive: true })
  switch (platform) {
    case 'win32':
      await writeFile(join(dir, 'electron.exe'), 'exe', 'utf8')
      await writeFile(join(dir, 'LICENSE'), 'license', 'utf8')
      await mkdir(join(dir, 'resources'), { recursive: true })
      await writeFile(join(dir, 'resources', 'default_app.asar'), 'asar', 'utf8')
      break
    case 'linux':
      await writeFile(join(dir, 'electron'), 'elf', 'utf8')
      await mkdir(join(dir, 'resources'), { recursive: true })
      await writeFile(join(dir, 'resources', 'default_app.asar'), 'asar', 'utf8')
      break
    case 'darwin': {
      const contents = join(dir, 'Electron.app', 'Contents')
      await mkdir(join(contents, 'MacOS'), { recursive: true })
      await mkdir(join(contents, 'Resources'), { recursive: true })
      await writeFile(join(contents, 'Info.plist'), PLIST, 'utf8')
      await writeFile(join(contents, 'MacOS', 'Electron'), 'macho', 'utf8')
      await writeFile(join(contents, 'Resources', 'default_app.asar'), 'asar', 'utf8')
      break
    }
    default:
      throw new Error(`no fake zip for ${platform}`)
  }
}

function tools(overrides: Partial<DesktopTools> = {}): DesktopTools {
  return {
    playerDir: player,
    buildPlayer: vi.fn(async () => ({ ok: true, lines: ['built'] })),
    fetchElectron: vi.fn(
      async (version: string, target: DesktopPlatformInfo, onProgress: (fraction: number) => void) => {
        onProgress(0.5)
        onProgress(1)
        return `zip:${target.platform}:${target.arch}:${version}`
      }
    ),
    unzip: vi.fn(fakeUnzip),
    ...overrides
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-desktop-'))
  out = join(root, 'release')
  player = join(root, 'Player')

  await mkdir(join(root, 'the-gate', 'ink'), { recursive: true })
  await writeFile(join(root, 'the-gate', 'ink', 'main.ink'), ENTRY, 'utf8')
  project = {
    id: 'prj_0000000000',
    title: 'The Gate: Part 2?',
    libraries: [],
    main: 'ink/main.ink',
    description: '',
    bundleOut: null,
    path: join(root, 'the-gate')
  }

  // A player checkout after `npm run build` and `npm run desktop:compile`,
  // with a second game in dist/ that must be left behind.
  await mkdir(join(player, 'node_modules', 'electron'), { recursive: true })
  await writeFile(join(player, 'package.json'), '{"name":"inkcrafter-player"}', 'utf8')
  await writeFile(join(player, 'node_modules', 'electron', 'package.json'), '{"version":"43.4.1"}', 'utf8')
  const steamworks = join(player, 'node_modules', 'steamworks.js')
  for (const native of ['win64', 'linux64', 'osx']) {
    await mkdir(join(steamworks, 'dist', native), { recursive: true })
    await writeFile(join(steamworks, 'dist', native, 'lib.bin'), native, 'utf8')
  }
  await writeFile(join(steamworks, 'package.json'), '{"name":"steamworks.js"}', 'utf8')
  await writeFile(join(steamworks, 'index.js'), 'module.exports = {}', 'utf8')
  await mkdir(join(player, 'dist', 'assets'), { recursive: true })
  await mkdir(join(player, 'dist', 'breedhaven'), { recursive: true })
  await writeFile(join(player, 'dist', 'index.html'), '<html>engine</html>', 'utf8')
  await writeFile(join(player, 'dist', 'assets', 'index-abc.js'), 'engine()', 'utf8')
  await writeFile(join(player, 'dist', 'breedhaven', 'manifest.json'), '{}', 'utf8')
  await mkdir(join(player, 'desktop-dist'), { recursive: true })
  await writeFile(join(player, 'desktop-dist', 'main.cjs'), 'main', 'utf8')
  await writeFile(join(player, 'desktop-dist', 'preload.cjs'), 'preload', 'utf8')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
}

describe('exportDesktop', () => {
  it('writes a Windows build that runs the one game', async () => {
    const result = await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64'], steamAppId: 480 },
      tools()
    )

    expect(result.ok).toBe(true)
    expect(result.builds).toEqual([
      { platform: 'win32-x64', outDir: join(out, 'windows'), problem: null }
    ])

    const windows = join(out, 'windows')
    // The executable takes the game's name, with the characters no filesystem
    // would take stripped out; Electron's own is gone, and so is its demo app.
    expect(await exists(join(windows, 'The Gate Part 2.exe'))).toBe(true)
    expect(await exists(join(windows, 'electron.exe'))).toBe(false)
    expect(await exists(join(windows, 'resources', 'default_app.asar'))).toBe(false)

    const app = join(windows, 'resources', 'app')
    expect(await json(join(app, 'package.json'))).toMatchObject({
      name: 'the-gate',
      productName: 'The Gate: Part 2?',
      main: 'desktop-dist/main.cjs'
    })
    expect(await json(join(app, 'player.json'))).toEqual({
      format: 1,
      game: 'the-gate',
      title: 'The Gate: Part 2?',
      steamAppId: 480
    })
    expect(await readFile(join(app, 'desktop-dist', 'main.cjs'), 'utf8')).toBe('main')
    expect(await readFile(join(app, 'dist', 'index.html'), 'utf8')).toBe('<html>engine</html>')
    expect(await exists(join(app, 'dist', 'assets', 'index-abc.js'))).toBe(true)

    // The bundle is there under the game's id, and the other game in the
    // player's dist/ did not come along.
    expect(await exists(join(app, 'dist', 'the-gate', 'manifest.json'))).toBe(true)
    expect(await exists(join(app, 'dist', 'the-gate', 'story.json'))).toBe(true)
    expect(await exists(join(app, 'dist', 'breedhaven'))).toBe(false)

    // Only this platform's native library ships.
    expect(await readdir(join(app, 'node_modules', 'steamworks.js', 'dist'))).toEqual(['win64'])

    expect(await json(join(out, DESKTOP_MARKER))).toMatchObject({
      format: 'inkcrafter-desktop/1',
      game: 'the-gate',
      electron: '43.4.1',
      steamAppId: 480,
      builds: [{ platform: 'win32-x64', folder: 'windows' }]
    })
    expect(await readFile(join(out, 'README.txt'), 'utf8')).toContain('Run The Gate Part 2.exe')
  })

  it('renames the Mac app and its executable together', async () => {
    const result = await exportDesktop(
      project,
      out,
      { platforms: ['darwin-arm64'], steamAppId: null },
      tools()
    )

    expect(result.ok).toBe(true)
    const app = join(out, 'macos-apple-silicon', 'The Gate Part 2.app')
    expect(await exists(join(app, 'Contents', 'MacOS', 'The Gate Part 2'))).toBe(true)
    expect(await exists(join(app, 'Contents', 'MacOS', 'Electron'))).toBe(false)

    const plist = await readFile(join(app, 'Contents', 'Info.plist'), 'utf8')
    expect(plist).toContain('<key>CFBundleExecutable</key>\n\t<string>The Gate Part 2</string>')
    expect(plist).toContain('<key>CFBundleIdentifier</key>\n\t<string>com.inkcrafter.the-gate</string>')
    expect(plist).toContain('<key>CFBundleName</key>\n\t<string>The Gate: Part 2?</string>')
    // Absent from Electron's plist, so added rather than replaced.
    expect(plist).toContain('<key>CFBundleDisplayName</key>\n\t<string>The Gate: Part 2?</string>')

    const resources = join(app, 'Contents', 'Resources')
    expect(await exists(join(resources, 'default_app.asar'))).toBe(false)
    expect(await exists(join(resources, 'app', 'dist', 'the-gate', 'manifest.json'))).toBe(true)
    expect(await readdir(join(resources, 'app', 'node_modules', 'steamworks.js', 'dist'))).toEqual(['osx'])
    expect(await readFile(join(out, 'README.txt'), 'utf8')).toContain('codesign --force --deep --sign -')
  })

  it('names the Linux binary after the game id', async () => {
    const result = await exportDesktop(
      project,
      out,
      { platforms: ['linux-x64'], steamAppId: null },
      tools()
    )

    expect(result.ok).toBe(true)
    expect(await exists(join(out, 'linux', 'the-gate'))).toBe(true)
    expect(await exists(join(out, 'linux', 'electron'))).toBe(false)
    expect(
      await readdir(join(out, 'linux', 'resources', 'app', 'node_modules', 'steamworks.js', 'dist'))
    ).toEqual(['linux64'])
    expect(await json(join(out, 'linux', 'resources', 'app', 'player.json'))).toMatchObject({
      steamAppId: null
    })
  })

  // One download failing is the likeliest way a four-platform export goes
  // wrong, and it should cost that platform rather than the other three.
  it('keeps the platforms that could be assembled when one could not', async () => {
    const result = await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64', 'linux-x64', 'darwin-x64'], steamAppId: null },
      tools({
        unzip: async (zip, dir) => {
          if (zip.includes(':linux:')) throw new Error('the download was cut short')
          await fakeUnzip(zip, dir)
        }
      })
    )

    expect(result.ok).toBe(true)
    expect(result.builds).toEqual([
      { platform: 'win32-x64', outDir: join(out, 'windows'), problem: null },
      { platform: 'linux-x64', outDir: null, problem: 'the download was cut short' },
      { platform: 'darwin-x64', outDir: join(out, 'macos-intel'), problem: null }
    ])
    expect(await exists(join(out, 'linux'))).toBe(false)
    expect((await json(join(out, DESKTOP_MARKER)))['builds']).toEqual([
      { platform: 'win32-x64', folder: 'windows' },
      { platform: 'darwin-x64', folder: 'macos-intel' }
    ])
  })

  it('fetches the Electron the player was built against, for each platform', async () => {
    const t = tools()
    await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64', 'darwin-arm64'], steamAppId: null },
      t
    )

    const calls = vi.mocked(t.fetchElectron).mock.calls.map(([version, target]) => [
      version,
      target.platform,
      target.arch
    ])
    expect(calls).toEqual([
      ['43.4.1', 'win32', 'x64'],
      ['43.4.1', 'darwin', 'arm64']
    ])
  })

  it('says what it is doing, in order', async () => {
    const messages: string[] = []
    await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64'], steamAppId: null },
      tools(),
      (report) => messages.push(report.message)
    )

    expect(messages).toEqual([
      'Building the player…',
      'Compiling the story…',
      'Fetching Electron 43.4.1 for Windows…',
      'Fetching Electron 43.4.1 for Windows… 50%',
      'Fetching Electron 43.4.1 for Windows… 100%',
      'Unpacking Electron for Windows…',
      'Assembling Windows…'
    ])
  })

  it('replaces its own previous export and refuses anybody else’s folder', async () => {
    const first = await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64'], steamAppId: null },
      tools()
    )
    expect(first.ok).toBe(true)

    const again = await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64'], steamAppId: 480 },
      tools()
    )
    expect(again.ok).toBe(true)
    expect(await json(join(out, 'windows', 'resources', 'app', 'player.json'))).toMatchObject({
      steamAppId: 480
    })

    const elsewhere = join(root, 'documents')
    await mkdir(elsewhere, { recursive: true })
    await writeFile(join(elsewhere, 'novel.docx'), 'a year of work', 'utf8')
    const refused = await exportDesktop(
      project,
      elsewhere,
      { platforms: ['win32-x64'], steamAppId: null },
      tools()
    )
    expect(refused.ok).toBe(false)
    expect(refused.warnings.join(' ')).toContain('not a desktop export')
    expect(await readdir(elsewhere)).toEqual(['novel.docx'])
  })

  it('refuses a web bundle’s folder, which wants a player rather than being one', async () => {
    await mkdir(out, { recursive: true })
    await writeFile(join(out, 'manifest.json'), '{}', 'utf8')

    const result = await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64'], steamAppId: null },
      tools()
    )

    expect(result.ok).toBe(false)
    expect(result.warnings.join(' ')).toContain('holds a web bundle')
  })

  it('refuses when the player does not build, and shows why', async () => {
    const result = await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64'], steamAppId: null },
      tools({
        buildPlayer: async () => ({
          ok: false,
          lines: ['> tsc --noEmit', "src/main.ts(4,1): error TS2304: Cannot find name 'Phaser'."]
        })
      })
    )

    expect(result.ok).toBe(false)
    expect(result.builds).toEqual([])
    expect(result.warnings.join('\n')).toContain('The player did not build')
    expect(result.warnings.join('\n')).toContain("Cannot find name 'Phaser'")
    expect(await exists(out)).toBe(false)
  })

  it('refuses a story that does not compile, writing nothing', async () => {
    await writeFile(join(project.path, 'ink', 'main.ink'), '-> nowhere\n', 'utf8')

    const result = await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64'], steamAppId: null },
      tools()
    )

    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((one) => one.severity === 'error')).toBe(true)
    expect(await exists(out)).toBe(false)
  })

  // The private key is compiled into the engine by the player's build. An
  // engine built before the key was installed would ship a bundle it cannot
  // open — a game that starts and stops at the first file.
  it('refuses a protected project the engine was built without a key for', async () => {
    project.protection = {
      mode: 'protected',
      keyId: 'abc123def456abc123def456',
      publicKey: 'irrelevant here'
    }

    const without = await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64'], steamAppId: null },
      tools()
    )
    expect(without.ok).toBe(false)
    expect(without.warnings.join(' ')).toContain('release key abc123def456abc123def456')
    expect(await exists(out)).toBe(false)

    await writeFile(
      join(player, 'dist', 'assets', 'index-abc.js'),
      'engine({"abc123def456abc123def456":"..."})',
      'utf8'
    )
    // A real public key is needed once the export goes ahead; this one is
    // about the check before it, so stop there.
    const messages: string[] = []
    await exportDesktop(
      project,
      out,
      { platforms: ['win32-x64'], steamAppId: null },
      tools(),
      (report) => messages.push(report.message)
    ).catch(() => {})
    expect(messages).toContain('Compiling the story…')
  })

  it('refuses a player that is not installed before trying to build it', async () => {
    await rm(join(player, 'node_modules'), { recursive: true, force: true })
    const t = tools()

    const result = await exportDesktop(project, out, { platforms: ['win32-x64'], steamAppId: null }, t)

    expect(result.ok).toBe(false)
    expect(result.warnings.join(' ')).toContain('npm install')
    expect(t.buildPlayer).not.toHaveBeenCalled()
  })

  it('asks for at least one platform', async () => {
    const result = await exportDesktop(project, out, { platforms: [], steamAppId: null }, tools())

    expect(result.ok).toBe(false)
    expect(result.warnings).toEqual(['Choose at least one platform.'])
  })
})

describe('gameIdFor', () => {
  it('takes the project folder, then the title, and never the engine’s own folder', () => {
    expect(gameIdFor(project)).toBe('the-gate')
    expect(gameIdFor({ ...project, path: join(root, 'my project') })).toBe('the-gate-part-2')
    expect(gameIdFor({ ...project, path: join(root, 'assets') })).toBe('the-gate-part-2')
  })
})

describe('fileName', () => {
  it('keeps what every filesystem will take', () => {
    expect(fileName('The Gate: Part 2?')).toBe('The Gate Part 2')
    expect(fileName('  Wren/Sparrow  ')).toBe('WrenSparrow')
    expect(fileName('...')).toBe('')
  })
})

describe('setPlistString', () => {
  it('replaces a value in place and adds a key the plist lacks', () => {
    const changed = setPlistString(PLIST, 'CFBundleExecutable', 'A & B <C>')
    expect(changed).toContain('<key>CFBundleExecutable</key>\n\t<string>A &amp; B &lt;C&gt;</string>')
    expect(changed).not.toContain('<string>Electron</string>\n\t<key>CFBundleIdentifier')

    const added = setPlistString(PLIST, 'CFBundleDisplayName', 'Shown')
    expect(added).toContain('<key>CFBundleDisplayName</key>\n\t<string>Shown</string>\n</dict>\n</plist>')
  })
})
