import type { MenuAction } from './settings'

/**
 * Every command in the app, once.
 *
 * The design system's rule is that anything reachable from a menu or a toolbar
 * must also be reachable from the command palette — that invariant is what
 * earns the right to keep toolbars and pane headers short. An invariant kept by
 * remembering is not kept, so the menu bar and the palette are both built from
 * this list rather than each holding their own copy.
 *
 * `menu.ts` turns it into an Electron template; the renderer's palette renders
 * it directly. Neither owns it.
 */

export interface AppCommand {
  action: MenuAction
  /** Mirrors the menu bar verbatim — that is the rule, and these are the menus. */
  section: 'File' | 'Edit' | 'View' | 'Settings'
  /** The menu's own label, sentence case. An ellipsis means a further step. */
  label: string
  /** Electron form, e.g. `CmdOrCtrl+O`. Rendered per platform for display. */
  accelerator?: string
  /** Lucide name, from the house set. */
  icon?: string
}

export const APP_COMMANDS: readonly AppCommand[] = [
  { action: 'file:newProject', section: 'File', label: 'New project…', icon: 'plus' },
  { action: 'file:openProject', section: 'File', label: 'Open project…', accelerator: 'CmdOrCtrl+O', icon: 'folder-open' },
  { action: 'file:openPackage', section: 'File', label: 'Open a package…', icon: 'file-archive' },
  { action: 'file:newFile', section: 'File', label: 'New file…', accelerator: 'CmdOrCtrl+N', icon: 'file-text' },
  { action: 'file:save', section: 'File', label: 'Save', accelerator: 'CmdOrCtrl+S', icon: 'save' },
  { action: 'project:export', section: 'File', label: 'Export for player…', accelerator: 'CmdOrCtrl+E', icon: 'package' },
  { action: 'file:packageProject', section: 'File', label: 'Package project…', icon: 'file-archive' },
  { action: 'file:closeProject', section: 'File', label: 'Close project', accelerator: 'CmdOrCtrl+W', icon: 'x' },

  { action: 'search:inFiles', section: 'Edit', label: 'Find in files…', accelerator: 'CmdOrCtrl+Shift+F', icon: 'search' },

  { action: 'view:editor', section: 'View', label: 'Editor', accelerator: 'CmdOrCtrl+1', icon: 'file-text' },
  { action: 'view:manuscript', section: 'View', label: 'Manuscript', accelerator: 'CmdOrCtrl+2', icon: 'book-open' },
  { action: 'view:outline', section: 'View', label: 'Plan', accelerator: 'CmdOrCtrl+3', icon: 'git-branch' },
  // One view, four ways in. Worth naming each here even though it is a tab once
  // you arrive: a palette is where you look for a thing by name, not for the
  // view that happens to contain it.
  { action: 'project:media', section: 'View', label: 'Game: media', accelerator: 'CmdOrCtrl+4', icon: 'image' },
  { action: 'project:stats', section: 'View', label: 'Game: stats & items', accelerator: 'CmdOrCtrl+5', icon: 'package' },
  { action: 'project:cast', section: 'View', label: 'Game: cast', accelerator: 'CmdOrCtrl+6', icon: 'users' },
  { action: 'project:map', section: 'View', label: 'Game: map', accelerator: 'CmdOrCtrl+7', icon: 'map' },
  { action: 'assistant:open', section: 'View', label: 'Assistant', accelerator: 'CmdOrCtrl+Shift+A', icon: 'sparkles' },
  { action: 'project:libraries', section: 'View', label: 'Codex libraries…', accelerator: undefined, icon: 'book-open' },
  { action: 'project:settings', section: 'View', label: 'Project settings…', icon: 'settings' },

  // The palette itself, so the one shortcut that opens everything is also in
  // the menu — a keystroke nobody can discover is not a command surface.
  { action: 'view:commands', section: 'View', label: 'Commands…', accelerator: 'CmdOrCtrl+K', icon: 'search' },

  // Beside Export, because it is the same act with the tedious half done for
  // you: build the bundle, put it where the player looks, and start the player.
  { action: 'player:preview', section: 'File', label: 'Preview in player', accelerator: 'CmdOrCtrl+Shift+P', icon: 'play' },

  { action: 'settings:open', section: 'Settings', label: 'Settings', icon: 'sliders-horizontal' }
]

/**
 * The roles the palette deliberately does not carry.
 *
 * Two reasons, and both are worth stating rather than leaving as an oversight.
 * None of them has a `MenuAction` — they are handled by Electron, not by the
 * renderer, so there is nothing for the palette to dispatch. And the palette
 * holds focus while it is open, so a clipboard role run from it would act on
 * the palette's own search box rather than on the editor underneath.
 *
 * `commands.test.ts` asserts that this set and the palette's contents together
 * account for every entry in the menu bar, so "everything is in the palette"
 * stays checkable with one written exception rather than being a slogan.
 */
export const PALETTE_EXEMPT_ROLES = [
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'selectAll',
  'reload',
  'toggleDevTools',
  'resetZoom',
  'zoomIn',
  'zoomOut',
  'togglefullscreen',
  'quit',
  'about',
  'hide',
  'hideOthers',
  'unhide'
] as const

export type ExemptRole = (typeof PALETTE_EXEMPT_ROLES)[number]

export type MenuEntry =
  | { kind: 'command'; action: MenuAction }
  | { kind: 'role'; role: ExemptRole }
  | { kind: 'separator' }

export interface MenuSection {
  label: string
  entries: MenuEntry[]
}

/**
 * The menu bar's shape.
 *
 * Labels and accelerators are not repeated here — they come from
 * `APP_COMMANDS`, which is the point. The macOS application menu and the
 * top-level Settings item are built in `menu.ts`, because they are platform
 * chrome rather than commands.
 */
export const MENU_LAYOUT: readonly MenuSection[] = [
  {
    label: '&File',
    entries: [
      { kind: 'command', action: 'file:newProject' },
      { kind: 'command', action: 'file:openProject' },
      { kind: 'command', action: 'file:openPackage' },
      { kind: 'separator' },
      { kind: 'command', action: 'file:newFile' },
      { kind: 'command', action: 'file:save' },
      { kind: 'separator' },
      { kind: 'command', action: 'player:preview' },
      { kind: 'command', action: 'project:export' },
      { kind: 'command', action: 'file:packageProject' },
      { kind: 'separator' },
      { kind: 'command', action: 'file:closeProject' }
    ]
  },
  {
    // Setting an application menu replaces Electron's default, and the standard
    // clipboard shortcuts come from these roles. Without this menu, Ctrl+C and
    // Ctrl+V stop working inside the editor.
    label: '&Edit',
    entries: [
      { kind: 'role', role: 'undo' },
      { kind: 'role', role: 'redo' },
      { kind: 'separator' },
      { kind: 'role', role: 'cut' },
      { kind: 'role', role: 'copy' },
      { kind: 'role', role: 'paste' },
      { kind: 'role', role: 'selectAll' },
      { kind: 'separator' },
      { kind: 'command', action: 'search:inFiles' }
    ]
  },
  {
    label: '&View',
    entries: [
      { kind: 'command', action: 'view:commands' },
      { kind: 'separator' },
      { kind: 'command', action: 'view:editor' },
      { kind: 'command', action: 'view:manuscript' },
      { kind: 'command', action: 'view:outline' },
      { kind: 'separator' },
      { kind: 'command', action: 'project:media' },
      { kind: 'command', action: 'project:stats' },
      { kind: 'command', action: 'project:cast' },
      { kind: 'command', action: 'project:map' },
      { kind: 'command', action: 'assistant:open' },
      { kind: 'separator' },
      { kind: 'command', action: 'project:libraries' },
      { kind: 'command', action: 'project:settings' },
      { kind: 'separator' },
      { kind: 'role', role: 'reload' },
      { kind: 'role', role: 'toggleDevTools' },
      { kind: 'separator' },
      { kind: 'role', role: 'resetZoom' },
      { kind: 'role', role: 'zoomIn' },
      { kind: 'role', role: 'zoomOut' },
      { kind: 'separator' },
      { kind: 'role', role: 'togglefullscreen' }
    ]
  }
]

export function commandFor(action: MenuAction): AppCommand {
  const command = APP_COMMANDS.find((one) => one.action === action)
  if (!command) throw new Error(`No command for ${action}`)
  return command
}

/**
 * An accelerator as the reader's platform writes it.
 *
 * Electron's own form is `CmdOrCtrl+Shift+A`, which is correct for binding and
 * wrong for showing to anybody.
 */
export function displayKeys(accelerator: string, platform: string): string {
  const mac = platform === 'darwin'
  return accelerator
    .replace('CmdOrCtrl', mac ? '⌘' : 'Ctrl')
    .replace('Command', '⌘')
    .replace('Shift', mac ? '⇧' : 'Shift')
    .replace('Alt', mac ? '⌥' : 'Alt')
    .split('+')
    .join(mac ? '' : '+')
}
