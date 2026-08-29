import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /**
   * What is being guarded, as a noun phrase: "the search dialog". Named in the
   * heading so a nested boundary says which part died rather than implying the
   * whole app did.
   */
  label?: string
}

interface ErrorBoundaryState {
  error: Error | null
  /** React's own trace, which names the component — the useful half of a report. */
  componentStack: string | null
}

/**
 * The last thing between a thrown error and a blank window.
 *
 * Without one, React unmounts the whole tree on any error escaping a render or
 * an effect, and the app becomes a white rectangle with the reason visible only
 * in DevTools. That is indistinguishable from a crash, and it is what a search
 * result's clean-up bug looked like from the outside.
 *
 * Deliberately built from plain elements and no design-system imports: a
 * fallback that renders through the app's own components cannot be trusted to
 * render when the thing that broke is one of them. It leans on CSS variables
 * only, which are a stylesheet and cannot throw.
 *
 * There is no error boundary for events, timers or promise rejections — React
 * catches none of those — so this is a floor, not a net.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null })
    // Still worth the console: this keeps the full object inspectable in
    // DevTools, where the copy below is only ever text.
    console.error('Caught by the error boundary:', error, info.componentStack)
  }

  private details(): string {
    const { error, componentStack } = this.state
    return [
      `${error?.name ?? 'Error'}: ${error?.message ?? 'unknown'}`,
      error?.stack ?? '',
      componentStack ? `Component stack:${componentStack}` : ''
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  override render(): ReactNode {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    const what = this.props.label ?? 'The app'

    return (
      <div className="crash" role="alert">
        <div className="crash__box">
          <h1 className="crash__title">{what} stopped working.</h1>
          <p className="crash__lead">
            Nothing has been written to your project. Anything unsaved in the editor is still
            in the window until you reload.
          </p>

          <pre className="crash__detail">{this.details()}</pre>

          <div className="crash__actions">
            <button
              type="button"
              className="crash__button crash__button--primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <button
              type="button"
              className="crash__button"
              onClick={() => this.setState({ error: null, componentStack: null })}
            >
              Try again
            </button>
            <button
              type="button"
              className="crash__button"
              onClick={() => void navigator.clipboard?.writeText(this.details())}
            >
              Copy details
            </button>
          </div>
          {componentStack === null && (
            <p className="crash__lead">The component stack was not reported.</p>
          )}
        </div>
      </div>
    )
  }
}
