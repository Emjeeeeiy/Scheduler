import { Component } from 'react'

/** A class component is the only way React lets anything catch a render
    error — there is no hook equivalent. Wraps the signed-in app shell so a
    bad Firestore document or a bug reaching layoutDay/packSpans mid-render
    white-screens the tab instead of leaving the rest of the app usable, and
    gives the one recovery a page in this state can honestly offer: reload. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { caught: null }
  }

  static getDerivedStateFromError(caught) {
    return { caught }
  }

  componentDidCatch(caught, info) {
    console.error('Cadence crashed.', caught, info)
  }

  render() {
    if (!this.state.caught) return this.props.children
    return (
      <div className="centered">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'center',
          }}
        >
          <p className="banner banner--error" role="alert">
            Something went wrong, and this page can’t recover on its own.
          </p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
