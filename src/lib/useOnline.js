import { useSyncExternalStore } from 'react'

function subscribe(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** Whether the browser believes it has a connection. Only a hint — a captive
    portal still says "online" — which is why callers use it to word a message
    ("syncs when you're back online"), never to decide whether to write. The
    server snapshot is `true`: nothing renders offline-specific copy before the
    client has actually checked. */
export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
}
