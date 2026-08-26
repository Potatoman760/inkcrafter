import { describe, expect, it } from 'vitest'
import {
  APP_COMMANDS,
  MENU_LAYOUT,
  PALETTE_EXEMPT_ROLES,
  commandFor,
  displayKeys
} from './commands'
import { MENU_ACTIONS } from './settings'

/**
 * The rule the command palette exists to keep: anything reachable from a menu
 * or a toolbar is reachable from the palette. It earns short toolbars, and it
 * is only worth anything if it is checked.
 */

describe('the command index', () => {
  it('has one command per action the renderer handles', () => {
    const covered = APP_COMMANDS.map((command) => command.action).sort()
    expect(covered).toEqual([...MENU_ACTIONS].sort())
  })

  it('names each action once', () => {
    const actions = APP_COMMANDS.map((command) => command.action)
    expect(new Set(actions).size).toBe(actions.length)
  })

  it('puts every menu entry in the palette, or in the written exceptions', () => {
    for (const section of MENU_LAYOUT) {
      for (const entry of section.entries) {
        if (entry.kind === 'separator') continue
        if (entry.kind === 'role') {
          expect(PALETTE_EXEMPT_ROLES).toContain(entry.role)
          continue
        }
        // Throws if the layout names a command the index does not have.
        expect(commandFor(entry.action).label).toBeTruthy()
      }
    }
  })

  it('claims no accelerator twice, since a duplicate silently wins for one', () => {
    const keys = APP_COMMANDS.map((command) => command.accelerator).filter(Boolean)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('sections the palette by the menus it mirrors', () => {
    const sections = new Set(APP_COMMANDS.map((command) => command.section))
    // Edit is all roles, so it has no palette entries — the other three are the
    // menu bar, verbatim.
    expect([...sections].sort()).toEqual(['File', 'Settings', 'View'])
  })

  it('writes a label an author would recognise, not an action id', () => {
    for (const command of APP_COMMANDS) {
      // "Game: media" is prose — an action id is not.
      expect(command.label).not.toBe(command.action)
      expect(command.label).not.toMatch(/^[a-z]+:[a-z]/)
      // Sentence case: the design system is explicit that Title Case is never
      // used, and an ellipsis means the command opens a further step.
      expect(command.label[0]).toBe(command.label[0]!.toUpperCase())
    }
  })
})

describe('displayKeys', () => {
  it('writes a Windows accelerator the way Windows writes it', () => {
    expect(displayKeys('CmdOrCtrl+Shift+A', 'win32')).toBe('Ctrl+Shift+A')
    expect(displayKeys('CmdOrCtrl+K', 'linux')).toBe('Ctrl+K')
  })

  it('writes a mac accelerator the way a mac does, without the plusses', () => {
    expect(displayKeys('CmdOrCtrl+Shift+A', 'darwin')).toBe('⌘⇧A')
    expect(displayKeys('CmdOrCtrl+K', 'darwin')).toBe('⌘K')
  })
})
