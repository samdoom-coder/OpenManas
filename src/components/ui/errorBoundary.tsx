import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * App root crash guard. Without this, any render throw (e.g. a malformed
 * cached block/page after reload) unmounts the whole tree into a blank white
 * page with no recovery. This shows what broke and offers Reload / safe
 * recovery instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    try {
      console.error('[app] render crash', error)
      localStorage.setItem(
        'openmanas_last_crash_v1',
        JSON.stringify({ message: String(error?.message || error), at: new Date().toISOString() }),
      )
    } catch { /* reporting must never throw */ }
  }

  private reload = () => window.location.reload()

  private resetCacheAndReload = () => {
    try {
      localStorage.removeItem('openmanas_state_v1')
      localStorage.removeItem('nexus_state_v1')
      localStorage.removeItem('openmanas_selected_v1')
    } catch { /* noop */ }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
        <div className="max-w-[480px] w-full rounded-2xl border bg-card p-6 text-center">
          <div className="text-3xl">⚠️</div>
          <h1 className="text-lg font-bold mt-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The app hit a render error (often a corrupted local cache after an
            update). Your server data is untouched.
          </p>
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs font-mono break-all text-left max-h-[96px] overflow-auto">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <div className="mt-4 flex gap-2 justify-center">
            <button onClick={this.reload} className="h-9 rounded-xl bg-foreground px-4 text-sm font-medium text-background">
              Reload
            </button>
            <button onClick={this.resetCacheAndReload} className="h-9 rounded-xl border px-4 text-sm hover:bg-accent">
              Clear local cache + reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
