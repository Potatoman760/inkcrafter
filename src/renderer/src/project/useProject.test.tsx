// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Project } from '@shared/project'
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
})
