import { useSyncExternalStore } from 'react'

/* Is the primary pointer a finger? `(pointer: coarse)` describes the device's main
   input, not a single event, so a laptop with a touch screen still answers "fine"
   (its trackpad) and keeps drag and drop. Where this is true the app stops
   offering gestures a thumb starts by accident — the native drag a long press
   begins, and edge handles that sit under a scrolling finger.

   A hook rather than a one-off `matchMedia` call because the answer can change
   (a tablet docked to a mouse), and because a render needs a snapshot that is
   stable on the server, where there is no `window`: there it is `false`, the
   desktop behaviour, which is also what the SSR smoke render expects. */
const QUERY = '(pointer: coarse)'

function subscribe(onChange) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const list = window.matchMedia(QUERY)
  list.addEventListener?.('change', onChange)
  return () => list.removeEventListener?.('change', onChange)
}

function getSnapshot() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false
}

const getServerSnapshot = () => false

export function useCoarsePointer() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
