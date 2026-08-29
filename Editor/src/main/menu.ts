import { Menu, app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { MENU_LAYOUT, commandFor } from '@shared/commands'
import type { MenuAction } from '@shared/settings'

/**
 * The application menu.
 *
 * Menu items do not do the work; they send an action to the renderer, which
 * already owns saving, project switching and the settings overlay. Keeping the
 * behaviour in one place avoids a second implementation of every command that
 * would have to be kept in step with the buttons.
 *
 * Items stay permanently enabled. Reflecting "nothing is open" in native item
 * state means rebuilding the whole menu on every file and project change, and
 * the renderer already ignores actions that do not apply.
 *
 * The split is deliberate. **File** is file operations and nothing else;
 * **View** is everything you can look at or open, which is where the features
 * live. They were in File, where a feature with no button anywhere else is a
 * feature nobody finds.
 *
 * Labels and accelerators are not written here any more. They come from
 * `@shared/commands`, which the command palette also reads, so a command cannot
 * exist in one and be missing from the other — which is the design system's
 * rule about the three command surfaces, held by construction rather than by
 * remembering.
 */
export function menuTemplate(
  send: (action: MenuAction) => () => void,
  isMac = process.platform === 'darwin'
): MenuItemConstructorOptions[] {
  const item = (action: MenuAction): MenuItemConstructorOptions => {
    const command = commandFor(action)
    return {
      label: command.label,
      ...(command.accelerator ? { accelerator: command.accelerator } : {}),
      click: send(action)
    }
  }

  const section = (label: string): MenuItemConstructorOptions => {
    const layout = MENU_LAYOUT.find((one) => one.label === label)
    if (!layout) throw new Error(`No menu section ${label}`)

    return {
      label,
      submenu: layout.entries.map((entry) =>
        entry.kind === 'command'
          ? item(entry.action)
          : entry.kind === 'role'
            ? ({ role: entry.role } as MenuItemConstructorOptions)
            : { type: 'separator' }
      )
    }
  }

  const file = section('&File')

  return [
    // macOS expects the app menu first, with Preferences under it.
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Preferences…', accelerator: 'Command+,', click: send('settings:open') },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] satisfies MenuItemConstructorOptions[])
      : []),

    // Quit lives under File everywhere except macOS, where it is in the app menu.
    isMac
      ? file
      : {
          ...file,
          submenu: [
            ...(file.submenu as MenuItemConstructorOptions[]),
            { type: 'separator' },
            { role: 'quit' }
          ]
        },

    section('&Edit'),
    section('&View'),

    // The only top-level item that is not a menu. Settings is app configuration
    // rather than a feature of the story, which is why it stays out of View.
    { label: '&Settings', click: send('settings:open') }
  ]
}

export function buildMenu(window: BrowserWindow): void {
  const send = (action: MenuAction) => (): void => {
    window.webContents.send('menu:action', action)
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(send)))
}
