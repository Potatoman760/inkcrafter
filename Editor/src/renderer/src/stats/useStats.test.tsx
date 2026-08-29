// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { addStat, emptyStats, newStat, removeStat, type StatsDocument } from '@shared/statsDoc'
import type { Project } from '@shared/project'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installApi } from '../../../test/harness'
import { useStats } from './useStats'

const project: Project = {
  id: 'prj_0000000000',
  title: 'Test story',
  libraries: [],
  main: 'ink/main.ink',
  description: '',
  bundleOut: null,
  path: 'C:\\work\\projects\\test-story'
}

const seeded = (): StatsDocument => addStat(emptyStats(), newStat('Strength'))

describe('useStats', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('writes a removed stat and reports the regenerated state file', async () => {
    const initial = seeded()
    const write = vi.fn(async (_project: Project, _doc: StatsDocument) => ({
      written: ['stats.json', 'ink/state.ink', 'export/catalogue.json']
    }))
    installApi({
      stats: {
        read: vi.fn(async () => initial),
        write
      }
    })
    const onWritten = vi.fn()
    const { result } = renderHook(() => useStats(project, true, 0, onWritten))

    await waitFor(() => expect(result.current.doc.stats).toHaveLength(1))

    act(() => {
      result.current.apply(removeStat(result.current.doc, initial.stats[0]!.id))
    })
    await act(async () => {
      await result.current.flush()
    })

    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]![1].stats).toEqual([])
    expect(onWritten).toHaveBeenCalledWith([
      'stats.json',
      'ink/state.ink',
      'export/catalogue.json'
    ])
  })
})
