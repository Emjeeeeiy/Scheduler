import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/* Registered only in a production build. In dev, a service worker would sit
   between Vite and the browser and serve yesterday's module graph out of a
   cache, which looks exactly like an edit that silently did nothing.
   Registration is deferred to `load` so it never competes with the app's own
   first paint for bandwidth, and a failure is logged rather than surfaced —
   the app works fine without it; only offline start-up is lost. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((caught) => console.warn('Offline support is unavailable.', caught))
  })
}
