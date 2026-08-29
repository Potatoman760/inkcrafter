// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Project } from '@shared/project'
import type { ProjectCheck } from '@shared/types'
import { installApi } from '../../../test/harness'
import { DebugPanel } from './DebugPanel'

/**
 * The whole project's problems, on demand.
 *
 * What earns the tests is the half that nothing else reports: a `# char:` tag
 * naming a sprite that is not in the catalogue compiles perfectly and is a
 * blank stage at runtime, and until this panel existed it surfaced only when
 * exporting. That, and the navigation — a problem you cannot open is a dead
 * end, and preflight and the compiler report their paths differently.
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

const empty: ProjectCheck = { diagnostics: [], problems: [], files: 3 }

function panel(check: ProjectCheck = empty) {
  const api = installApi({ project: { check: vi.fn(async () => check) } })
  const onOpen = vi.fn()
  const onBeforeRun = vi.fn(async () => {})

  render(<DebugPanel project={project} onBeforeRun={onBeforeRun} onOpen={onOpen} />)

  return { api, onOpen, onBeforeRun }
}

const runCheck = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Run check' }))
}

describe('DebugPanel', () => {
  it('checks nothing until asked', () => {
    const { api } = panel()

    expect(api.project.check).not.toHaveBeenCalled()
    // Nothing said before a run: the button already says what it does.
    expect(screen.queryByText(/files/)).not.toBeInTheDocument()
  })

  // The reason the panel exists: this is invisible to the compiler.
  it('reports a tag naming a sprite that is not in the catalogue', async () => {
    panel({
      diagnostics: [],
      problems: [
        {
          file: 'chapter3/peasant-quarter.ink',
          line: 121,
          message: '#char: wren/furious — wren has no look called furious (it has neutral, happy).'
        }
      ],
      files: 3
    })

    await runCheck()

    expect(await screen.findByText(/wren has no look called furious/)).toBeInTheDocument()
    expect(screen.getByText('1 catalogue problem in 3 files')).toBeInTheDocument()
  })

  it('opens the file and line a catalogue problem names', async () => {
    const { onOpen } = panel({
      diagnostics: [],
      problems: [{ file: 'chapter3/peasant-quarter.ink', line: 121, message: 'no such look' }],
      files: 1
    })

    await runCheck()
    await userEvent.click(await screen.findByText('no such look'))

    expect(onOpen).toHaveBeenCalledWith('chapter3/peasant-quarter.ink', 121)
  })

  // ink reports an absolute path where preflight reports a project-relative
  // one, and only the relative form can be opened.
  it('shortens the absolute path a compiler error carries', async () => {
    const { onOpen } = panel({
      diagnostics: [
        {
          severity: 'error',
          message: 'Expected target for divert',
          file: 'C:/projects/breedhaven/chapter2/maren.ink',
          line: 141,
          raw: ''
        }
      ],
      problems: [],
      files: 2
    })

    await runCheck()
    await userEvent.click(await screen.findByText('Expected target for divert'))

    expect(onOpen).toHaveBeenCalledWith('chapter2/maren.ink', 141)
  })

  it('saves the open buffer first, so it checks what is on screen', async () => {
    const { onBeforeRun, api } = panel()

    await runCheck()

    expect(onBeforeRun).toHaveBeenCalled()
    expect(api.project.check).toHaveBeenCalledWith(project)
  })

  it('says so when there is nothing to report', async () => {
    panel()

    await runCheck()

    expect(await screen.findByText('Clean, 3 files')).toBeInTheDocument()
  })

  it('reports a check that threw rather than showing a clean story', async () => {
    installApi({
      project: {
        check: vi.fn(async () => {
          throw new Error('the entry point is missing')
        })
      }
    })
    render(<DebugPanel project={project} onBeforeRun={vi.fn(async () => {})} onOpen={vi.fn()} />)

    await runCheck()

    expect(await screen.findByText('the entry point is missing')).toBeInTheDocument()
  })
})
