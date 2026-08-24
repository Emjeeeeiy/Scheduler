import { useAuth } from '../state/AuthContext.jsx'

export function SignIn() {
  const { signIn, error } = useAuth()

  return (
    <div className="centered">
      <div className="signin card">
        <span className="signin__mark" aria-hidden="true">◷</span>
        <h1 className="signin__title">Scheduler</h1>
        <p className="signin__lead">
          Plan your days in blocks, keep the loose ends in one inbox, and see where the hours
          actually went.
        </p>

        <button type="button" className="primary-button primary-button--lg" onClick={signIn}>
          Sign in with Google
        </button>

        {error && (
          <p className="banner banner--error" role="alert">
            <span aria-hidden="true">⚠</span> {error}
          </p>
        )}

        <p className="signin__note">Your schedule is private to your account.</p>
      </div>
    </div>
  )
}
