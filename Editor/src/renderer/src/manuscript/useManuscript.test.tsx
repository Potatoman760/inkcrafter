// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import type { Project } from '@shared/project'
import { describe, expect, it, vi } from 'vitest'
import { installApi, manuscript, prose } from '../../../test/harness'
import { useManuscript } from './useManuscript'

const project: Project = {
  id: 'prj_0000000000',
  title: 'Test story',
  libraries: [],
  main: 'ink/main.ink',
  description: '',
  bundleOut: null,
  path: 'C:\\work\\projects\\test-story'
}

describe('useManuscript', () => {
  it('reopens the manuscript after the assistant changes ink', async () => {
    const open = vi
      .fn()
      .mockResolvedValueOnce(manuscript([prose('Before')]))
      .mockResolvedValue(manuscript([prose('After')]))
    installApi({ manuscript: { open } })

    const { result, rerender } = renderHook(
      ({ reloadKey }) => useManuscript(project, project.main, reloadKey),
      { initialProps: { reloadKey: 0 } }
    )
    await waitFor(() => expect(result.current.manuscript.nodes[0]).toMatchObject({ text: 'Before' }))

    rerender({ reloadKey: 1 })

    await waitFor(() => expect(result.current.manuscript.nodes[0]).toMatchObject({ text: 'After' }))
  })
})
