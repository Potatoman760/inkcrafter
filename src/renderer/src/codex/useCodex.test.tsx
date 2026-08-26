// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { newEntry, type CodexEntry } from '@shared/codex'
import type { Project } from '@shared/project'
import { describe, expect, it, vi } from 'vitest'
import { installApi } from '../../../test/harness'
import { useCodex } from './useCodex'

const project = (libraries: string[]): Project => ({
  id: 'prj_0000000000',
  title: 'Test story',
  libraries,
  main: 'ink/main.ink',
  description: '',
  bundleOut: null,
  path: 'C:\\work\\projects\\test-story'
})

describe('useCodex', () => {
  it('reloads entries after an assistant workspace write', async () => {
    const first = newEntry('lib_0000000000', 'Wren', 'character', 'characters/wren')
    const second = newEntry('lib_0000000000', 'Mara', 'character', 'characters/mara')
    const load = vi
      .fn<(ids: string[]) => Promise<CodexEntry[]>>()
      .mockResolvedValueOnce([first])
      .mockResolvedValue([first, second])

    installApi({
      projects: { list: vi.fn(async () => [project(['lib_0000000000'])]) },
      libraries: { list: vi.fn(async () => []) },
      codex: { load }
    })

    const { result, rerender } = renderHook(
      ({ reloadKey }) => useCodex(project(['lib_0000000000']), reloadKey),
      { initialProps: { reloadKey: 0 } }
    )
    await waitFor(() => expect(result.current.entries.map((entry) => entry.name)).toEqual(['Wren']))

    rerender({ reloadKey: 1 })

    await waitFor(() =>
      expect(result.current.entries.map((entry) => entry.name)).toEqual(['Wren', 'Mara'])
    )
  })

  it('deletes an entry and persists relations removed from survivors', async () => {
    const wren = newEntry('lib_0000000000', 'Wren', 'character', 'characters/wren')
    const mara = {
      ...newEntry('lib_0000000000', 'Mara', 'character', 'characters/mara'),
      relations: [wren.id]
    }
    const remove = vi.fn(async () => undefined)
    const save = vi.fn(async () => undefined)
    installApi({
      projects: { list: vi.fn(async () => [project(['lib_0000000000'])]) },
      libraries: { list: vi.fn(async () => []) },
      codex: {
        load: vi.fn(async () => [wren, mara]),
        remove,
        save
      }
    })
    const { result } = renderHook(() => useCodex(project(['lib_0000000000'])))
    await waitFor(() => expect(result.current.entries).toHaveLength(2))

    await act(async () => {
      await result.current.remove(wren)
    })

    expect(remove).toHaveBeenCalledWith(wren)
    expect(result.current.entries.map((entry) => entry.name)).toEqual(['Mara'])
    expect(result.current.entries[0]!.relations).toEqual([])
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: mara.id, relations: [] }), {
      [mara.id]: 'Mara'
    })
  })

  it('reads newly linked libraries from disk even when the renderer project is stale', async () => {
    const oldLibrary = 'lib_0000000000'
    const newLibrary = 'lib_1111111111'
    const faye = newEntry(newLibrary, 'Faye Fertillay', 'character', 'characters/faye')
    const list = vi.fn(async () => [project([oldLibrary, newLibrary])])
    const load = vi.fn(async (ids: string[]) => (ids.includes(newLibrary) ? [faye] : []))
    installApi({
      projects: { list },
      libraries: { list: vi.fn(async () => []) },
      codex: { load }
    })

    const { result } = renderHook(() => useCodex(project([oldLibrary]), 1))

    await waitFor(() => expect(result.current.entries.map((entry) => entry.name)).toEqual(['Faye Fertillay']))
    expect(load).toHaveBeenCalledWith([oldLibrary, newLibrary])
  })

  it('does not let an older reload overwrite the assistant result', async () => {
    const oldLibrary = 'lib_0000000000'
    const newLibrary = 'lib_1111111111'
    const oldEntry = newEntry(oldLibrary, 'Old entry', 'lore', 'lores/old')
    const newEntryFromAssistant = newEntry(newLibrary, 'New entry', 'lore', 'lores/new')
    let resolveOld!: (entries: CodexEntry[]) => void
    let resolveNew!: (entries: CodexEntry[]) => void
    const oldLoad = new Promise<CodexEntry[]>((resolve) => {
      resolveOld = resolve
    })
    const newLoad = new Promise<CodexEntry[]>((resolve) => {
      resolveNew = resolve
    })
    const projects = vi
      .fn<() => Promise<Project[]>>()
      .mockResolvedValueOnce([project([oldLibrary])])
      .mockResolvedValue([project([oldLibrary, newLibrary])])
    const load = vi.fn((ids: string[]) => (ids.includes(newLibrary) ? newLoad : oldLoad))
    installApi({
      projects: { list: projects },
      libraries: { list: vi.fn(async () => []) },
      codex: { load }
    })

    const staleProject = project([oldLibrary])
    const { result, rerender } = renderHook(
      ({ reloadKey }) => useCodex(staleProject, reloadKey),
      { initialProps: { reloadKey: 0 } }
    )
    await waitFor(() => expect(load).toHaveBeenCalledWith([oldLibrary]))
    rerender({ reloadKey: 1 })
    await waitFor(() => expect(load).toHaveBeenCalledWith([oldLibrary, newLibrary]))

    await act(async () => resolveNew([newEntryFromAssistant]))
    await waitFor(() => expect(result.current.entries.map((entry) => entry.name)).toEqual(['New entry']))
    await act(async () => resolveOld([oldEntry]))

    expect(result.current.entries.map((entry) => entry.name)).toEqual(['New entry'])
  })
})
