import { spawn } from 'node:child_process'
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { slugify } from '@shared/codex'
import { BUNDLE_FILES, isGameId } from '@shared/bundle/manifest'
import {
  desktopPlatform,
  type DesktopBuildResult,
  type DesktopExportOptions,
  type DesktopExportProgress,
  type DesktopExportResult,
  type DesktopPlatformInfo
} from '@shared/desktop'
import type { Project } from '@shared/project'
import { exportBundle, swapIn } from './bundle'
import { exists, isDirectory } from './fs'

/**
 * Exporting a project as a desktop game: one folder per platform, each of
 * which runs with nothing installed.
 *
 * The web bundle needs a player to serve it. This export brings the player: the
 * engine the `Player` package builds, the Electron main that gives it saves,
 * fullscreen and Steam, and Electron itself — the prebuilt shell Electron
 * publishes for every platform, which is what `npm install electron` fetches
 * for this one. Putting an app inside that shell is a copy and a rename, and
 * it is the same copy and rename on every platform, so a Linux or Mac build
 * can be assembled on Windows. That is the whole reason this does not use
 * electron-builder, which can only build the platform it is running on.
 *
 * What is not done here is signing. A Mac build cannot be signed anywhere but
 * a Mac, and Apple silicon refuses to run an unsigned one, so the folder that
 * comes out for it is finished everywhere but there, and the README beside it
 * says exactly what is left.
 *
 * Everything that reaches outside this process — running the player's build,
 * fetching an Electron, unpacking a zip — comes in through `DesktopTools`, so
 * the assembly can be tested without a network or a hundred megabytes.
 */

export interface DesktopTools {
  /** The `Player` package, whose build is the engine that ships. */
  playerDir: string
  /** Builds the player. Resolves either way; `lines` is what it printed. */
  buildPlayer: (dir: string, onLine: (line: string) => void) => Promise<{ ok: boolean; lines: string[] }>
  /** Fetches Electron for one platform and resolves with the zip's path. */
  fetchElectron: (
    version: string,
    target: DesktopPlatformInfo,
    onProgress: (fraction: number) => void
  ) => Promise<string>
  /** Unpacks a zip into a folder that does not exist yet. */
  unzip: (zip: string, dir: string) => Promise<void>
}

/** Written at the destination's top level, so a re-export knows the folder is its own. */
export const DESKTOP_MARKER = 'inkcrafter-desktop.json'

/** Beside `package.json` in the app, read by the Electron main. */
const PLAYER_CONFIG = 'player.json'

/** How much of a failed build is worth showing. */
const KEPT_LINES = 30

/** Which of steamworks.js's native folders each platform runs. */
const STEAMWORKS_NATIVE: Record<DesktopPlatformInfo['platform'], string> = {
  win32: 'win64',
  linux: 'linux64',
  darwin: 'osx'
}

export async function exportDesktop(
  project: Project,
  outDir: string,
  options: DesktopExportOptions,
  tools: DesktopTools,
  progress: (report: DesktopExportProgress) => void = () => {}
): Promise<DesktopExportResult> {
  const warnings: string[] = []
  const refused = (reason: string): DesktopExportResult => ({
    ok: false,
    outDir,
    builds: [],
    diagnostics: [],
    warnings: [...warnings, reason]
  })

  if (options.platforms.length === 0) return refused('Choose at least one platform.')

  const refusal = await refuseDestination(outDir)
  if (refusal !== null) return refused(refusal)

  const cannot = await canBuildPlayer(tools.playerDir)
  if (cannot !== null) return refused(cannot)

  // Built rather than trusted, every time. An engine that is a week older than
  // the player's source would ship a week of fixes short, and nothing about
  // the folder says which week it is from.
  progress({ message: 'Building the player…' })
  const build = await tools.buildPlayer(tools.playerDir, () => {})
  if (!build.ok) {
    return refused(
      `The player did not build. From ${tools.playerDir}:\n${build.lines.slice(-KEPT_LINES).join('\n')}`
    )
  }

  const engine = await checkEngine(tools.playerDir)
  if (engine.problem !== null) return refused(engine.problem)

  if (project.protection) {
    const keyId = project.protection.keyId
    if (!(await engineHasKey(tools.playerDir, keyId))) {
      return refused(
        `The player was built without release key ${keyId}, so it could not open this ` +
          'project’s protected bundle. Install the key from Project settings, then export again.'
      )
    }
  }

  const gameId = gameIdFor(project)
  const work = join(dirname(outDir), `.${basename(outDir)}.inkcrafter-desktop-tmp`)
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })

  try {
    progress({ message: 'Compiling the story…' })
    const bundle = await exportBundle(project, join(work, 'game', gameId))
    warnings.push(...bundle.warnings)
    if (!bundle.ok) {
      return { ok: false, outDir, builds: [], diagnostics: bundle.diagnostics, warnings }
    }

    await mkdir(outDir, { recursive: true })
    const builds: DesktopBuildResult[] = []
    for (const id of options.platforms) {
      const target = desktopPlatform(id)
      const staging = join(work, target.folder)
      const destination = join(outDir, target.folder)
      try {
        await assemble(target, {
          project,
          gameId,
          bundleDir: bundle.outDir,
          engineVersion: engine.version,
          steamAppId: options.steamAppId,
          playerDir: tools.playerDir,
          staging,
          tools,
          progress
        })
        await swapIn(staging, destination, warnings)
        builds.push({ platform: id, outDir: destination, problem: null })
      } catch (error) {
        builds.push({ platform: id, outDir: null, problem: explain(target, error) })
      }
    }

    const written = builds.filter((one) => one.outDir !== null)
    if (written.length > 0) {
      await writeFile(
        join(outDir, DESKTOP_MARKER),
        `${JSON.stringify(
          {
            format: 'inkcrafter-desktop/1',
            generatedBy: 'InkCrafter',
            generatedAt: new Date().toISOString(),
            project: { id: project.id, title: project.title },
            game: gameId,
            electron: engine.version,
            steamAppId: options.steamAppId,
            builds: written.map((one) => ({
              platform: one.platform,
              folder: desktopPlatform(one.platform).folder
            }))
          },
          null,
          2
        )}\n`,
        'utf8'
      )
      await writeFile(join(outDir, 'README.txt'), readme(project, gameId, written, options), 'utf8')
    }

    return { ok: written.length > 0, outDir, builds, diagnostics: bundle.diagnostics, warnings }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/**
 * What went wrong with one platform, in terms of what to do about it.
 *
 * The one failure seen in practice: a Mac app is full of symlinks, and Windows
 * will not let an ordinary process create one. The raw error says "a required
 * privilege is not held", which is true and no help at all.
 */
function explain(target: DesktopPlatformInfo, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (target.platform === 'darwin' && process.platform === 'win32' && /symlink|1314/i.test(message)) {
    return (
      'A Mac app holds symbolic links, and Windows only lets an app create those with ' +
      'Developer Mode on (Settings → System → For developers) or when run as administrator. ' +
      'Turn one on and export again, or build the Mac folder on a Mac or Linux machine.'
    )
  }
  return message
}

interface Assembly {
  project: Project
  gameId: string
  bundleDir: string
  engineVersion: string
  steamAppId: number | null
  playerDir: string
  staging: string
  tools: DesktopTools
  progress: (report: DesktopExportProgress) => void
}

/**
 * One platform's folder, from Electron's zip outwards.
 *
 * Electron's zips are laid out three ways: an `electron.exe` beside its DLLs,
 * an `electron` beside its `.so`s, and an `Electron.app`. In each the app goes
 * in `resources/app` — the folder Electron looks in when there is no
 * `app.asar` — and the executable takes the game's name, which is what a
 * reader sees in a task list and what Steam is told to launch.
 */
async function assemble(target: DesktopPlatformInfo, at: Assembly): Promise<void> {
  const { project, gameId, staging, tools, progress } = at
  const name = fileName(project.title) || gameId

  progress({ message: `Fetching Electron ${at.engineVersion} for ${target.label}…` })
  let lastShown = -1
  const zip = await tools.fetchElectron(at.engineVersion, target, (fraction) => {
    const percent = Math.floor(fraction * 100)
    if (percent === lastShown) return
    lastShown = percent
    progress({ message: `Fetching Electron ${at.engineVersion} for ${target.label}… ${percent}%` })
  })

  progress({ message: `Unpacking Electron for ${target.label}…` })
  await rm(staging, { recursive: true, force: true })
  await tools.unzip(zip, staging)

  progress({ message: `Assembling ${target.label}…` })
  let appDir: string
  switch (target.platform) {
    case 'win32': {
      await renameRequired(join(staging, 'electron.exe'), join(staging, `${name}.exe`))
      appDir = join(staging, 'resources', 'app')
      await rm(join(staging, 'resources', 'default_app.asar'), { force: true })
      break
    }
    case 'linux': {
      // The id rather than the title: a Linux launch path with spaces and
      // capitals in it is a support ticket waiting to happen.
      await renameRequired(join(staging, 'electron'), join(staging, gameId))
      appDir = join(staging, 'resources', 'app')
      await rm(join(staging, 'resources', 'default_app.asar'), { force: true })
      break
    }
    case 'darwin': {
      const app = join(staging, `${name}.app`)
      await renameRequired(join(staging, 'Electron.app'), app)
      await renameRequired(join(app, 'Contents', 'MacOS', 'Electron'), join(app, 'Contents', 'MacOS', name))
      const plist = join(app, 'Contents', 'Info.plist')
      let xml = await readFile(plist, 'utf8')
      xml = setPlistString(xml, 'CFBundleExecutable', name)
      xml = setPlistString(xml, 'CFBundleName', project.title)
      xml = setPlistString(xml, 'CFBundleDisplayName', project.title)
      xml = setPlistString(xml, 'CFBundleIdentifier', `com.inkcrafter.${gameId}`)
      await writeFile(plist, xml, 'utf8')
      appDir = join(app, 'Contents', 'Resources', 'app')
      await rm(join(app, 'Contents', 'Resources', 'default_app.asar'), { force: true })
      break
    }
  }

  await writeApp(appDir, target, at)
}

/**
 * The app itself: what Electron runs once it has found `resources/app`.
 *
 *   package.json          name, version and the main script
 *   player.json           which game, and the Steam App ID
 *   desktop-dist/         the Electron main and preload
 *   dist/index.html       the engine
 *   dist/assets/
 *   dist/<game>/          the bundle — the only game folder that comes along
 *   node_modules/steamworks.js/   with this platform's native library only
 *
 * `name` in package.json is what Electron folders the saves under, so it is
 * the game's rather than the player's: two games from one editor must not
 * share a save file.
 */
async function writeApp(appDir: string, target: DesktopPlatformInfo, at: Assembly): Promise<void> {
  const { project, gameId, playerDir } = at
  await mkdir(join(appDir, 'dist'), { recursive: true })

  await writeFile(
    join(appDir, 'package.json'),
    `${JSON.stringify(
      {
        name: gameId,
        productName: project.title,
        version: '1.0.0',
        description: project.title,
        main: 'desktop-dist/main.cjs',
        private: true
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  await writeFile(
    join(appDir, PLAYER_CONFIG),
    `${JSON.stringify({ format: 1, game: gameId, title: project.title, steamAppId: at.steamAppId }, null, 2)}\n`,
    'utf8'
  )

  await cp(join(playerDir, 'desktop-dist'), join(appDir, 'desktop-dist'), { recursive: true })
  await cp(join(playerDir, 'dist', 'index.html'), join(appDir, 'dist', 'index.html'))
  await cp(join(playerDir, 'dist', 'assets'), join(appDir, 'dist', 'assets'), { recursive: true })
  await cp(at.bundleDir, join(appDir, 'dist', gameId), { recursive: true })

  const steamworks = join(playerDir, 'node_modules', 'steamworks.js')
  const shipped = join(appDir, 'node_modules', 'steamworks.js')
  await mkdir(join(shipped, 'dist'), { recursive: true })
  for (const file of ['package.json', 'index.js', 'LICENSE']) {
    if (await exists(join(steamworks, file))) await cp(join(steamworks, file), join(shipped, file))
  }
  const native = STEAMWORKS_NATIVE[target.platform]
  await cp(join(steamworks, 'dist', native), join(shipped, 'dist', native), { recursive: true })
}

/** What has to be there once the player has built, and which Electron it was built against. */
async function checkEngine(playerDir: string): Promise<{ version: string; problem: string | null }> {
  const required = [
    join('dist', 'index.html'),
    join('dist', 'assets'),
    join('desktop-dist', 'main.cjs'),
    join('desktop-dist', 'preload.cjs'),
    join('node_modules', 'steamworks.js', 'index.js'),
    join('node_modules', 'electron', 'package.json')
  ]
  for (const path of required) {
    if (!(await exists(join(playerDir, path)))) {
      return { version: '', problem: `The player at ${playerDir} has no ${path} after building.` }
    }
  }
  const electron = JSON.parse(
    await readFile(join(playerDir, 'node_modules', 'electron', 'package.json'), 'utf8')
  ) as { version?: unknown }
  if (typeof electron.version !== 'string' || electron.version.length === 0) {
    return { version: '', problem: `The player's Electron has no version in its package.json.` }
  }
  return { version: electron.version, problem: null }
}

/**
 * Whether the built engine can open a bundle protected with this key.
 *
 * The private key is compiled into the engine's JavaScript by the player's
 * build, from the keyring InkCrafter installs there. The key id is written
 * beside it, so its presence in the built assets is the test — the key itself
 * is never read here.
 */
async function engineHasKey(playerDir: string, keyId: string): Promise<boolean> {
  const assets = join(playerDir, 'dist', 'assets')
  for (const file of await readdir(assets)) {
    if (!file.endsWith('.js')) continue
    if ((await readFile(join(assets, file), 'utf8')).includes(keyId)) return true
  }
  return false
}

/**
 * The folder the game sits in under `dist/`, which is the id the player asks
 * for. The project's own folder name is the natural one — it is what an export
 * into the player's `game/` would be called — with the title as a fallback.
 */
export function gameIdFor(project: Project): string {
  const candidates = [basename(project.path), slugify(project.title)]
  // `assets` is where the engine's own files go, so a game may not be called that.
  const found = candidates.find((one) => isGameId(one) && one !== 'assets')
  return found ?? 'game'
}

/** A title as a filename: whatever every platform will accept, or nothing. */
export function fileName(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]|[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
}

async function renameRequired(from: string, to: string): Promise<void> {
  if (!(await exists(from))) {
    throw new Error(`Electron's zip has no ${basename(from)} in it, so this is not the layout expected.`)
  }
  await rename(from, to)
}

/** Sets one string in an Info.plist, adding the key when the plist lacks it. */
export function setPlistString(xml: string, key: string, value: string): string {
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`)
  if (pattern.test(xml)) return xml.replace(pattern, (_whole, open: string, close: string) => `${open}${escaped}${close}`)
  return xml.replace(
    /<\/dict>\s*<\/plist>\s*$/,
    () => `\t<key>${key}</key>\n\t<string>${escaped}</string>\n</dict>\n</plist>\n`
  )
}

/**
 * Only somewhere empty, or somewhere this wrote before. The destination's
 * platform folders are replaced wholesale, and a folder with a year of work in
 * it is one misclick away in a native picker.
 */
async function refuseDestination(outDir: string): Promise<string | null> {
  let contents: string[]
  try {
    contents = await readdir(outDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') return `${outDir} is a file, not a folder.`
    throw error
  }
  if (contents.length === 0 || contents.includes(DESKTOP_MARKER)) return null
  if (contents.includes(BUNDLE_FILES.manifest)) {
    return `${outDir} holds a web bundle. A desktop export goes in a folder of its own. Nothing was written.`
  }
  return (
    `${outDir} is not empty and is not a desktop export. Exporting would replace what is in it, ` +
    'so nothing was written. Choose an empty folder.'
  )
}

function readme(
  project: Project,
  gameId: string,
  builds: DesktopBuildResult[],
  options: DesktopExportOptions
): string {
  const name = fileName(project.title) || gameId
  const lines: string[] = [
    `${project.title} — desktop builds`,
    '',
    'Exported by InkCrafter. Each folder below is the whole game for one platform:',
    'the story, its media, the player, and Electron. Nothing needs installing.',
    ''
  ]
  for (const build of builds) {
    const target = desktopPlatform(build.platform)
    lines.push(`${target.folder}/`)
    switch (target.platform) {
      case 'win32':
        lines.push(`    Run ${name}.exe.`)
        break
      case 'linux':
        lines.push(`    Run ./${gameId}. If it was exported from Windows, mark the binary executable first:`)
        lines.push(`        chmod +x ${gameId} chrome-sandbox chrome_crashpad_handler`)
        lines.push('    Where unprivileged user namespaces are disabled, launch with --no-sandbox.')
        break
      case 'darwin':
        lines.push(`    ${name}.app. It is not signed — that can only be done on a Mac, and an`)
        lines.push('    unsigned app will not run on Apple silicon. On a Mac, in this folder:')
        lines.push(`        chmod -R +x "${name}.app/Contents/MacOS" "${name}.app/Contents/Frameworks"`)
        lines.push(`        codesign --force --deep --sign - "${name}.app"`)
        lines.push('    For a build outside Steam, sign with a Developer ID and notarize as usual.')
        break
    }
    lines.push('')
  }
  lines.push('Steam')
  lines.push('    Upload each folder as its platform’s depot. The launch option is the')
  lines.push(`    executable named above. Steam App ID: ${options.steamAppId ?? 'not set — Steam features are off'}.`)
  lines.push('    A build launched outside Steam restarts itself through Steam; to test one')
  lines.push('    with Steam running but without that, put a steam_appid.txt holding the id')
  lines.push('    beside the executable. Do not ship that file.')
  lines.push('')
  lines.push('Saves and settings')
  lines.push(`    Kept in the platform’s per-user data folder under "${project.title}",`)
  lines.push('    and in Steam Cloud when Steam is running.')
  lines.push('')
  return `${lines.join('\n')}\n`
}

// --- the real tools ----------------------------------------------------------

/**
 * `npm run build` then `npm run desktop:compile` in the player.
 *
 * Spelled the way `player.ts` spawns the dev server: on Windows npm is a `.cmd`
 * the shell has to run, the arguments are fixed, and the folder travels as an
 * option rather than inside a command line.
 */
export async function buildPlayer(
  dir: string,
  onLine: (line: string) => void
): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = []
  const record = (chunk: Buffer): void => {
    for (const raw of String(chunk).split('\n')) {
      const line = raw.replace(/\[[0-9;]*m/g, '').trimEnd()
      if (line.length === 0) continue
      lines.push(line)
      onLine(line)
    }
  }

  for (const script of ['build', 'desktop:compile']) {
    const code = await new Promise<number>((resolve) => {
      // One fixed string rather than a command and arguments: on Windows npm is
      // a `.cmd` only a shell can run, and Node warns about handing a shell an
      // argument list it will only concatenate. Nothing here came from the author.
      const child = spawn(`npm run ${script}`, {
        cwd: dir,
        shell: true,
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '0' }
      })
      child.stdout?.on('data', record)
      child.stderr?.on('data', record)
      child.on('error', (cause) => {
        lines.push(`Could not run npm: ${cause.message}`)
        resolve(1)
      })
      child.on('exit', (exit) => resolve(exit ?? 1))
    })
    if (code !== 0) return { ok: false, lines }
  }
  return { ok: true, lines }
}

/**
 * Electron's zip for a platform, from the same cache `npm install electron`
 * fills — so the platform this editor runs on is usually there already, and a
 * second export never downloads anything.
 */
export async function fetchElectron(
  version: string,
  target: DesktopPlatformInfo,
  onProgress: (fraction: number) => void
): Promise<string> {
  const { downloadArtifact } = await import('@electron/get')
  return downloadArtifact({
    version,
    platform: target.platform,
    arch: target.arch,
    artifactName: 'electron',
    downloadOptions: {
      getProgressCallback: (progress: { percent: number }) => onProgress(progress.percent)
    }
  })
}

export async function unzip(zip: string, dir: string): Promise<void> {
  const { extract } = await import('@electron-internal/extract-zip')
  await mkdir(dir, { recursive: true })
  await extract(zip, { dir })
}

export function desktopTools(playerDir: string): DesktopTools {
  return { playerDir, buildPlayer, fetchElectron, unzip }
}

/** Whether the folder is a player checkout that can build. */
export async function canBuildPlayer(playerDir: string): Promise<string | null> {
  if (!(await isDirectory(playerDir))) return `${playerDir} is not a folder.`
  if (!(await exists(join(playerDir, 'package.json')))) return `${playerDir} has no package.json.`
  if (!(await exists(join(playerDir, 'node_modules')))) {
    return `The player at ${playerDir} is not installed — run npm install in it first.`
  }
  return null
}
