import type { InkDiagnostic } from './types'

/**
 * A self-contained desktop export: the game and the player in one folder.
 *
 * The web bundle is one half of a game — it needs a player to serve it. This
 * is the other kind of export, where the player comes too: Electron's own
 * prebuilt shell for each platform, the built engine, the Electron main that
 * gives it saves, fullscreen and Steam, and exactly one bundle. The folder
 * that comes out runs on a machine with nothing installed, and is what a Steam
 * depot is made of.
 *
 * Every platform is assembled the same way from the same parts, on whatever
 * machine the editor runs on: Electron ships as a zip per platform, and putting
 * an app inside one is a copy and a rename. That is what makes a Linux or Mac
 * build possible from Windows. It is also why a Mac build is not *finished*
 * here — it cannot be signed from anywhere but a Mac, and Apple silicon will
 * not run an unsigned one — and the export says so rather than pretending.
 */

export type DesktopPlatform = 'win32-x64' | 'linux-x64' | 'darwin-arm64' | 'darwin-x64'

export interface DesktopPlatformInfo {
  id: DesktopPlatform
  /** As the dialog names it. */
  label: string
  /** Electron's own names for the download. */
  platform: 'win32' | 'linux' | 'darwin'
  arch: 'x64' | 'arm64'
  /** Suffix of the folder the build is written to, under the destination. */
  folder: string
}

export const DESKTOP_PLATFORMS: readonly DesktopPlatformInfo[] = [
  { id: 'win32-x64', label: 'Windows', platform: 'win32', arch: 'x64', folder: 'windows' },
  { id: 'linux-x64', label: 'Linux', platform: 'linux', arch: 'x64', folder: 'linux' },
  {
    id: 'darwin-arm64',
    label: 'macOS (Apple silicon)',
    platform: 'darwin',
    arch: 'arm64',
    folder: 'macos-apple-silicon'
  },
  { id: 'darwin-x64', label: 'macOS (Intel)', platform: 'darwin', arch: 'x64', folder: 'macos-intel' }
]

export function isDesktopPlatform(value: unknown): value is DesktopPlatform {
  return DESKTOP_PLATFORMS.some((one) => one.id === value)
}

export function desktopPlatform(id: DesktopPlatform): DesktopPlatformInfo {
  const found = DESKTOP_PLATFORMS.find((one) => one.id === id)
  if (!found) throw new Error(`Unknown desktop platform ${id}.`)
  return found
}

/** What the project remembers about its desktop release, between exports. */
export interface DesktopRelease {
  /** Where the last desktop export wrote, absolute. */
  outDir: string | null
  /** Steam's number for this game, or null when it is not on Steam. */
  steamAppId: number | null
  platforms: DesktopPlatform[]
}

export const DEFAULT_DESKTOP_RELEASE: DesktopRelease = {
  outDir: null,
  steamAppId: null,
  platforms: ['win32-x64', 'linux-x64', 'darwin-arm64', 'darwin-x64']
}

export interface DesktopExportOptions {
  platforms: DesktopPlatform[]
  steamAppId: number | null
}

/**
 * Told as it happens. Building the player takes seconds and fetching an
 * Electron the machine has never seen takes a hundred megabytes, so a dialog
 * that only said "Exporting…" would look hung for a minute.
 */
export interface DesktopExportProgress {
  /** One line, present tense: what is happening now. */
  message: string
}

export interface DesktopBuildResult {
  platform: DesktopPlatform
  /** Absolute path of the folder that runs, or null when this platform failed. */
  outDir: string | null
  /** What went wrong, for a platform that could not be assembled. */
  problem: string | null
}

export interface DesktopExportResult {
  /** True when the story compiled and at least one platform was written. */
  ok: boolean
  /** The folder the platform builds are in. */
  outDir: string
  builds: DesktopBuildResult[]
  /** Compile diagnostics. Any `error` here means nothing was written. */
  diagnostics: InkDiagnostic[]
  /** The bundle's own warnings, and anything a platform build wants said. */
  warnings: string[]
}
