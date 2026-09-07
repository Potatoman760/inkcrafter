import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

vi.mock('electron', () => ({ Menu: {}, app: { name: 'InkCrafter' } }))

const { menuTemplate } = await import('./menu')
const { MENU_ACTIONS } = await import('@shared/settings')

/**
 * Rearranging a menu is exactly the change that quietly loses something — an
 * action that no longer appears anywhere, or two items claiming one accelerator
 * where a duplicate silently wins for whichever came first.
 */

interface Flat {
  label: string
  accelerator?: string
  action: string | null
  /** The top-level menu it sits under. */
  menu: string
}

/** Every leaf item, with the action its click sends. */
function flatten(isMac: boolean): Flat[] {
  const sent: string[] = []
  const send = (action: string) => (): void => {
    sent.push(action)
  }

  const template = menuTemplate(send as never, isMac)
  const found: Flat[] = []

  const walk = (items: MenuItemConstructorOptions[], menu: string): void => {
    for (const item of items) {
      if (item.type === 'separator') continue

      if (Array.isArray(item.submenu)) {
        walk(item.submenu, menu || String(item.label ?? ''))
        continue
      }

      let action: string | null = null
      if (typeof item.click === 'function') {
        sent.length = 0
        ;(item.click as () => void)()
        action = sent[0] ?? null
      }

      found.push({
        label: String(item.label ?? item.role ?? ''),
        ...(item.accelerator ? { accelerator: item.accelerator } : {}),
        action,
        menu
      })
    }
  }

  walk(template, '')
  return found
}

const under = (menu: string, isMac = false): Flat[] =>
  flatten(isMac).filter((item) => item.menu.replace('&', '') === menu)

describe('the menu', () => {
  it('reaches every action the renderer handles', () => {
    const reachable = new Set(flatten(false).map((item) => item.action))

    for (const action of MENU_ACTIONS) {
      expect(reachable, `${action} is not in the menu`).toContain(action)
    }
  })

  it('gives no two items the same accelerator', () => {
    for (const isMac of [false, true]) {
      const keys = flatten(isMac)
        .map((item) => item.accelerator)
        .filter((key): key is string => key !== undefined)

      expect(new Set(keys).size, `duplicate accelerator, isMac=${isMac}`).toBe(keys.length)
    }
  })

  /* Where things live -------------------------------------------------------- */

  // The complaint this rework answers: features hidden in File, with no button
  // anywhere else.
  it('keeps File to file operations', () => {
    const actions = under('File').map((item) => item.action)

    expect(actions).toEqual([
      'file:newProject',
      'file:openProject',
      // A package is a project in a file, so opening one belongs beside opening
      // one, and writing one beside the other thing that writes a release.
      'file:openPackage',
      'file:newFile',
      'file:save',
      // Both write files, and File is where every other app puts that. They are
      // operations rather than surfaces, which is what keeps them out of View —
      // and previewing is the same act as exporting with the tedium removed, so
      // it sits directly above it.
      'player:preview',
      'project:export',
      'file:packageProject',
      'file:closeProject',
      null // Quit, on Windows and Linux.
    ])
  })

  it('puts everything you can look at or open under View', () => {
    const actions = under('View').map((item) => item.action)

    expect(actions).toContain('project:media')
    expect(actions).toContain('project:stats')
    expect(actions).toContain('assistant:open')
    expect(actions).toContain('project:libraries')
    expect(actions).toContain('project:settings')
  })

  it('leaves Settings top level, being app configuration rather than a feature', () => {
    const settings = flatten(false).find((item) => item.action === 'settings:open')
    expect(settings?.menu.replace('&', '')).toBe('')
  })

  /* Accelerators worth not losing ------------------------------------------- */

  it('keeps the view switches on 1, 2 and 3', () => {
    const keyed = Object.fromEntries(
      flatten(false)
        .filter((item) => item.accelerator)
        .map((item) => [item.action, item.accelerator])
    )

    expect(keyed['view:editor']).toBe('CmdOrCtrl+1')
    expect(keyed['view:manuscript']).toBe('CmdOrCtrl+2')
    expect(keyed['view:outline']).toBe('CmdOrCtrl+3')
  })

  // Ctrl+K was the assistant's until the command palette arrived and wanted the
  // key the design system names for it. The assistant kept a shortcut rather
  // than losing one, and is in the palette besides — which is the trade the
  // palette exists to make.
  it('gives Ctrl+K to the palette and the assistant a key of its own', () => {
    const keyed = Object.fromEntries(
      flatten(false).map((item) => [item.action, item.accelerator])
    )

    expect(keyed['view:commands']).toBe('CmdOrCtrl+K')
    expect(keyed['assistant:open']).toBe('CmdOrCtrl+Shift+A')
  })

  it('gives the new tools a key of their own', () => {
    const media = flatten(false).find((item) => item.action === 'project:media')
    const stats = flatten(false).find((item) => item.action === 'project:stats')

    expect(media?.accelerator).toBe('CmdOrCtrl+4')
    expect(stats?.accelerator).toBe('CmdOrCtrl+5')
  })

  it('keeps the clipboard roles, which the editor depends on', () => {
    // Setting an application menu replaces Electron's default, so without these
    // Ctrl+C and Ctrl+V stop working inside CodeMirror.
    const roles = under('Edit').map((item) => item.label)
    for (const role of ['cut', 'copy', 'paste', 'selectAll']) expect(roles).toContain(role)
  })

  it('puts Preferences in the app menu on macOS, where it is expected', () => {
    const mac = flatten(true).find((item) => item.action === 'settings:open')
    expect(mac?.accelerator).toBe('Command+,')
  })
})
