// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useToasts } from './useToasts'

/**
 * The queue's rules, which are the whole component: a toast that outstays its
 * welcome covers the pane it was reporting on, and an error that clears itself
 * leaves the author believing a write succeeded.
 */

describe('useToasts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('names the file it wrote, because that is the evidence', () => {
    const { result } = renderHook(() => useToasts())

    act(() => result.current.wrote(['ink/state.ink']))

    expect(result.current.entries[0]!.title).toBe('Wrote ink/state.ink')
    expect(result.current.entries[0]!.detail).toBeUndefined()
  })

  it('counts the rest rather than listing every path', () => {
    const { result } = renderHook(() => useToasts())

    act(() => result.current.wrote(['ink/state.ink', 'ink/main.ink', 'export/catalogue.json']))

    expect(result.current.entries[0]!.detail).toBe('and 2 more')
  })

  it('leads with the generated ink, not the catalogue bookkeeping', () => {
    const { result } = renderHook(() => useToasts())

    // The order a catalogue save reports in: its own file first.
    act(() =>
      result.current.wrote(['stats.json', 'ink/state.ink', 'export/catalogue.json', 'ink/main.ink'])
    )

    expect(result.current.entries[0]!.title).toBe('Wrote ink/state.ink')
    expect(result.current.entries[0]!.detail).toBe('and 3 more')
  })

  it('says nothing when nothing was written', () => {
    const { result } = renderHook(() => useToasts())
    act(() => result.current.wrote([]))
    expect(result.current.entries).toHaveLength(0)
  })

  it('keeps two, and drops the oldest rather than the newest', () => {
    const { result } = renderHook(() => useToasts())

    act(() => {
      result.current.show({ tone: 'ok', title: 'first' })
      result.current.show({ tone: 'ok', title: 'second' })
      result.current.show({ tone: 'ok', title: 'third' })
    })

    // The most recent write is the one being asked about.
    expect(result.current.entries.map((entry) => entry.title)).toEqual(['second', 'third'])
  })

  it('does not say the same write twice in a row', () => {
    const { result } = renderHook(() => useToasts())

    act(() => {
      result.current.wrote(['ink/state.ink', 'stats.json'])
      result.current.wrote(['ink/state.ink', 'stats.json'])
    })

    expect(result.current.entries).toHaveLength(1)
  })

  it('clears an ok on its own', () => {
    const { result } = renderHook(() => useToasts())

    act(() => result.current.show({ tone: 'ok', title: 'Wrote ink/state.ink' }))
    expect(result.current.entries).toHaveLength(1)

    act(() => void vi.advanceTimersByTime(6000))
    expect(result.current.entries).toHaveLength(0)
  })

  it('never clears an error, which would look like it worked', () => {
    const { result } = renderHook(() => useToasts())

    act(() => result.current.show({ tone: 'error', title: 'Could not write ink/state.ink' }))
    act(() => void vi.advanceTimersByTime(60_000))

    expect(result.current.entries).toHaveLength(1)
  })

  it('can be dismissed by hand', () => {
    const { result } = renderHook(() => useToasts())

    act(() => result.current.show({ tone: 'error', title: 'Could not write' }))
    const id = result.current.entries[0]!.id
    act(() => result.current.dismiss(id))

    expect(result.current.entries).toHaveLength(0)
  })
})
