/** Shown when .env.local is missing or incomplete. A blank page plus a console
    stack trace is the usual failure here; these are the actual six steps. */
export function SetupNotice({ missing }) {
  return (
    <div className="centered">
      <div className="setup card">
        <h1 className="setup__title">Connect a Firebase project</h1>
        <p className="setup__lead">
          The app needs a Firebase project before it can sign you in or store anything.
          It takes about two minutes.
        </p>

        <ol className="setup__steps">
          <li>
            Create a project at{' '}
            <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">
              console.firebase.google.com
            </a>
          </li>
          <li>
            <strong>Authentication</strong> → Sign-in method → enable <strong>Google</strong>
          </li>
          <li>
            <strong>Firestore Database</strong> → Create database → <strong>production mode</strong>
          </li>
          <li>
            <strong>Project settings</strong> → Your apps → add a <strong>Web app</strong>, then
            copy the config values
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code>, paste the values in, and
            restart <code>npm run dev</code>
          </li>
          <li>
            Paste <code>firestore.rules</code> into Firestore → <strong>Rules</strong> → Publish
          </li>
        </ol>

        {missing.length > 0 && (
          <p className="setup__missing">
            Currently missing:{' '}
            {missing.map((key) => (
              <code key={key}>{key}</code>
            ))}
          </p>
        )}

        <p className="setup__note">
          These values are not secrets — the Firebase web config ships in the client bundle by
          design. <code>firestore.rules</code> is the real security boundary, which is why step 6
          matters.
        </p>
      </div>
    </div>
  )
}
