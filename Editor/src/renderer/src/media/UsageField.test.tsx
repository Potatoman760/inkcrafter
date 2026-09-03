// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newAsset, type MediaAsset } from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import type { MediaUsage } from '@shared/types'
import { installApi } from '../../../test/harness'
import { UsageField } from './UsageField'

/**
 * Where an asset is used.
 *
 * A look nothing shows is not an error, so nothing else in the app mentions it
 * — which makes "nowhere yet" as much of an answer as a list, and the reason
 * both are tested.
 */

const project: Project = {
  id: 'prj_2n8v5h1t6w',
  title: 'Breedhaven',
  libraries: [],
  main: 'ink/main.ink',
  description: '',
  path: 'C:/projects/breedhaven',
  bundleOut: null
}

function field(usage: MediaUsage, asset: MediaAsset = newAsset('Harbour', 'background')) {
  installApi({ project: { mediaUsage: vi.fn(async () => usage) } })
  const onOpen = vi.fn()

  render(<UsageField project={project} asset={asset} onOpen={onOpen} />)

  return { onOpen }
}

const use = (over: Partial<MediaUsage[string][number]> = {}): MediaUsage[string][number] => ({
  file: 'chapter1/arrival.ink',
  line: 12,
  knot: 'arrival',
  variant: 'day',
  raw: 'bg: harbour/day',
  ...over
})

describe('UsageField', () => {
  it('counts the uses and names the knot each is in', async () => {
    field({ 'background:harbour': [use(), use({ line: 40, knot: 'departure' })] })

    expect(await screen.findByText('2 places')).toBeInTheDocument()
    expect(screen.getByText('arrival')).toBeInTheDocument()
    expect(screen.getByText('departure')).toBeInTheDocument()
    expect(screen.getByText('chapter1/arrival.ink:12')).toBeInTheDocument()
  })

  it('opens the ink at the line the tag sits on', async () => {
    const { onOpen } = field({ 'background:harbour': [use()] })

    await userEvent.click(await screen.findByText('arrival'))

    expect(onOpen).toHaveBeenCalledWith('chapter1/arrival.ink', 12)
  })

  it('says nothing names it yet, without calling that a problem', async () => {
    field({})

    expect(await screen.findByText('Nowhere yet')).toBeInTheDocument()
    expect(screen.getByText(/can be catalogued before the scene/)).toBeInTheDocument()
  })

  // A tag above the first knot reaches no reader, which is worth seeing rather
  // than showing as a blank.
  it('says when a use sits above the first knot', async () => {
    field({ 'background:harbour': [use({ knot: null })] })

    expect(await screen.findByText('before the first knot')).toBeInTheDocument()
  })

  // Nothing tags a hotspot, so it can have no uses and must not look broken.
  it('answers for a kind no tag can name', async () => {
    field({ 'background:harbour': [use()] }, newAsset('Seedblossom', 'hotspot'))

    expect(await screen.findByText('Nowhere yet')).toBeInTheDocument()
  })
})
