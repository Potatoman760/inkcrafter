// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePaneWidth } from './usePaneWidth'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('usePaneWidth', () => {
  it('starts at the fallback when nothing was stored', () => {
    const { result } = renderHook(() => usePaneWidth('pane.a', 232))
    expect(result.current[0]).toBe(232)
  })

  it('starts at the stored width', () => {
    window.localStorage.setItem('pane.a', '317')
    const { result } = renderHook(() => usePaneWidth('pane.a', 232))
    expect(result.current[0]).toBe(317)
  })

  it('persists a committed width, rounded', () => {
    const { result } = renderHook(() => usePaneWidth('pane.a', 232))

    act(() => result.current[2](301.6))

    expect(result.current[0]).toBe(301.6)
    expect(window.localStorage.getItem('pane.a')).toBe('302')
  })

  it('does not persist while merely dragging', () => {
    const { result } = renderHook(() => usePaneWidth('pane.a', 232))

    act(() => result.current[1](400))

    expect(result.current[0]).toBe(400)
    expect(window.localStorage.getItem('pane.a')).toBeNull()
  })

  it('falls back when the stored value is not a number', () => {
    window.localStorage.setItem('pane.a', 'wide-ish')
    const { result } = renderHook(() => usePaneWidth('pane.a', 232))
    expect(result.current[0]).toBe(232)
  })

  it('starts anyway when storage is unavailable', () => {
    // A renderer loaded from file:// is not guaranteed a usable storage area,
    // and a layout preference must never stop the app opening.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })

    const { result } = renderHook(() => usePaneWidth('pane.a', 232))
    expect(result.current[0]).toBe(232)
  })

  it('keeps working when a write is refused', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })

    const { result } = renderHook(() => usePaneWidth('pane.a', 232))
    act(() => result.current[2](400))

    expect(result.current[0]).toBe(400)
  })
})
