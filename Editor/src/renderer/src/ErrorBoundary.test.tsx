// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * The floor under a thrown error.
 *
 * React logs a caught error itself, loudly, so the console is silenced here —
 * otherwise every run of this file prints a stack that looks like a failure.
 */

function Boom({ when = true }: { when?: boolean }): React.JSX.Element {
  if (when) throw new Error('destroy is not a function')
  return <p>the app</p>
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom when={false} />
      </ErrorBoundary>
    )

    expect(screen.getByText('the app')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the error instead of a blank window', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/The app stopped working/)).toBeInTheDocument()
    expect(screen.getByText(/destroy is not a function/)).toBeInTheDocument()
  })

  // A nested boundary should say which part died, not imply the whole app did.
  it('names what it was guarding, when told', () => {
    render(
      <ErrorBoundary label="The search dialog">
        <Boom />
      </ErrorBoundary>
    )

    expect(screen.getByText(/The search dialog stopped working/)).toBeInTheDocument()
  })

  it('reports the component that threw', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )

    expect(screen.getByText(/Boom/)).toBeInTheDocument()
  })

  it('goes back to the children when Try again succeeds', async () => {
    // Held outside the component: React retries a failed render, so a component
    // that decided this for itself would settle before the boundary caught it.
    let explode = true
    const Flaky = (): React.JSX.Element => <Boom when={explode} />

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()

    explode = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByText('the app')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('copies the details for a bug report', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )

    await userEvent.click(screen.getByRole('button', { name: 'Copy details' }))

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('destroy is not a function'))
  })
})
