import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
  /** What failed, in the user's words: "ReportLens", "The assistant". */
  name: string
  /** What Reload does. Default: reload the page. A panel can instead re-mount itself. */
  onReload?: () => void
  className?: string
}

interface State {
  error: Error | null
  attempt: number
}

/**
 * Catches errors thrown while rendering its children, so a bug shows a calm message with
 * Reload instead of a blank screen. Error boundaries must be class components: React has
 * no hook for getDerivedStateFromError / componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console for debugging; the user sees the fallback below.
    console.error(`${this.props.name} failed to render`, error, info.componentStack)
  }

  private reload = () => {
    if (this.props.onReload) {
      this.props.onReload()
      // Remount the children with a new key, starting from a clean state.
      this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))
    } else {
      window.location.reload()
    }
  }

  render() {
    if (this.state.error === null) {
      return <ErrorBoundaryChildren key={this.state.attempt}>{this.props.children}</ErrorBoundaryChildren>
    }
    return (
      <div role="alert" className={`grid min-h-0 place-items-center bg-app p-6 ${this.props.className ?? ""}`}>
        <div className="max-w-sm rounded-xl border border-dashed border-line-strong bg-panel px-6 py-7 text-center">
          <h2 className="m-0 mb-2 text-lg font-semibold tracking-tight text-text">{this.props.name} stopped working</h2>
          <p className="m-0 mb-5 font-reading text-sm leading-relaxed text-secondary">
            Something went wrong while showing this part of the page. Your questions are saved; reload to continue.
          </p>
          <button
            type="button"
            onClick={this.reload}
            className="min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-accent-ink md:min-h-9"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}

function ErrorBoundaryChildren({ children }: { children: ReactNode }) {
  return <>{children}</>
}
