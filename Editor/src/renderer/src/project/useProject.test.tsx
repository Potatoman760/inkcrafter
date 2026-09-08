// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Project, ProjectFile } from '@shared/project'
import { describe, expect, it, vi } from 'vitest'
import { installApi } from '../../../test/harness'
import { useProject } from './useProject'

const project = (libraries: string[]): Project => ({
  id: 'prj_0000000000',
  title: 'Test story',
  libraries,
  main: 'ink/main.ink',
  description: '',
  bundleOut: null,
  path: 'C:\\work\\projects\\test-story'
})

describe('useProject', () => {
  it('adopts manifest changes made outside the renderer', async () => {
    const before = project([])
    const after = project(['lib_0000000000'])
    const list = vi
      .fn<() => Promise<Project[]>>()
      .mockResolvedValueOnce([before])
      .mockResolvedValue([after])

    installApi({
      projects: {
        list,
        save: vi.fn(async () => undefined),
        files: vi.fn(async () => []),
        folders: vi.fn(async () => [])
      }
    })

    const { result } = renderHook(() => useProject())
    act(() => result.current.open(before))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.refreshFiles()
    })

    await waitFor(() => expect(result.current.project?.libraries).toEqual(after.libraries))
  })

  /*
   * The project's files are not only written by this app. Another editor, a
   * script, a `git checkout` — the watcher in main sees those and App turns
   * them into a new reload key, which has to reach the list or the tree shows
   * what was on disk when the project was opened.
   */
  it('re-reads the file list when something outside the app writes one', async () => {
    const before: ProjectFile[] = [
      { path: 'ink/main.ink', absolutePath: 'C:\work\projects\test-story\ink\main.ink' }
    ]
    const after: ProjectFile[] = [
      ...before,
      { path: 'ink/chapter2.ink', absolutePath: 'C:\work\projects\test-story\ink\chapter2.ink' }
    ]
    const files = vi
      .fn<() => Promise<ProjectFile[]>>()
      .mockResolvedValueOnce(before)
      .mockResolvedValue(after)

    installApi({
      projects: {
        list: vi.fn(async () => [project([])]),
        save: vi.fn(async () => undefined),
        files,
        folders: vi.fn(async () => ['ink'])
      }
    })

    const { result, rerender } = renderHook(({ key }) => useProject(key), {
      initialProps: { key: 0 }
    })
    act(() => result.current.open(project([])))
    await waitFor(() => expect(result.current.files).toEqual(before))

    rerender({ key: 1 })

    await waitFor(() => expect(result.current.files).toEqual(after))
  })

  it('leaves the list alone while the key does not change', async () => {
    const files = vi.fn<() => Promise<ProjectFile[]>>().mockResolvedValue([])
    installApi({
      projects: {
        list: vi.fn(async () => [project([])]),
        save: vi.fn(async () => undefined),
        files,
        folders: vi.fn(async () => [])
      }
    })

    const { rerender, result } = renderHook(({ key }) => useProject(key), {
      initialProps: { key: 0 }
    })
    act(() => result.current.open(project([])))
    await waitFor(() => expect(files).toHaveBeenCalledTimes(1))

    rerender({ key: 0 })
    rerender({ key: 0 })

    expect(files).toHaveBeenCalledTimes(1)
  })
})
