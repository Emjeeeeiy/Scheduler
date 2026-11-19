/* The phone's Back button, wired into the app.

   Cadence lives at one URL and keeps the page you are on as state, so without
   this nothing ever added a history entry: Android's Back button or gesture
   (and a browser's Back) skipped straight past every open dialog, menu and
   note and left the app — an installed app simply closed. Now each thing that
   is "up" — a popover, a dialog, an open note, a day you drilled into, a tab
   other than home — is a *layer* that owns one same-URL history entry, and
   Back closes the top layer instead.

   One stack for the whole app rather than each component pushing its own
   entries, because entries are a shared, ordered resource: two components
   each calling history.back() on close would step back over each other's
   entries, and the order the browser holds them in is not the order the user
   sees them stacked in.

   Rules the code below keeps:
   - Stacking is by RANK, then by registration order. Never by registration
     order alone: React runs a child's effects before its parent's, so opening
     the Journal straight onto a note would register the note before the
     shell's "back to the home tab" layer and put home on top.
   - The depth is read from `history.state`, never counted, so a reload that
     lands on a stale entry corrects itself.
   - Changes are applied once per microtask. React StrictMode mounts, unmounts
     and mounts again; one dialog hands over to another in the same update. Both
     net to nothing, and nothing touches history.
   - Closing a layer from the UI (its X, Escape, a tap outside) removes its
     entry with history.go(); the popstate that follows is ours and is not a
     Back press.

   No React and no window in here, so the logic is testable under node:test;
   `getBackStack()` binds it to the browser. */

/** Which layer Back closes first: the highest rank, then the latest opened. */
export const BACK_RANK = Object.freeze({
  /** A top-level tab other than home: Back goes home. */
  tab: 0,
  /** A day or month you drilled into from another view: Back returns. */
  trail: 1,
  /** A sub-screen inside a page: an open Journal note, a Settings section. */
  screen: 2,
  /** A transient card on the grid (Week's title card). */
  gesture: 3,
  modal: 4,
  /** Above modals: a popover can open inside a dialog and must close first. */
  popover: 5,
})

const STATE_KEY = 'cadenceBack'
/* If the browser never answers a history.go() (there was nowhere to go), stop
   waiting for it rather than holding every later change forever. */
const IN_FLIGHT_GIVE_UP_MS = 1000

export function createBackStack({
  history,
  schedule = queueMicrotask,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let layers = []
  let seq = 0
  let queued = false
  let inFlight = false
  let giveUp = null

  function depth() {
    const value = history.state?.[STATE_KEY]
    return Number.isInteger(value) && value > 0 ? value : 0
  }

  /* history.state survives a reload. A reload with a dialog open lands on an
     entry that says depth 1 while no layer exists, and sync() would answer that
     with go(-1) — which from a reloaded page is a second, full reload. The
     entries behind it are stale for the same reason and cannot be removed, but
     the one we are standing on can be told it is the bottom. */
  if (depth() > 0) history.replaceState(null, '')

  function top() {
    let best = null
    for (const layer of layers) {
      if (!best || layer.rank > best.rank || (layer.rank === best.rank && layer.seq > best.seq)) {
        best = layer
      }
    }
    return best
  }

  function settle() {
    inFlight = false
    if (giveUp !== null) clearTimer(giveUp)
    giveUp = null
  }

  /** Make the history depth match the number of layers. */
  function sync() {
    queued = false
    if (inFlight) return
    const current = depth()
    const desired = layers.length
    if (desired > current) {
      for (let n = current + 1; n <= desired; n += 1) history.pushState({ [STATE_KEY]: n }, '')
    } else if (desired < current) {
      inFlight = true
      giveUp = setTimer(() => {
        settle()
        request()
      }, IN_FLIGHT_GIVE_UP_MS)
      history.go(desired - current)
    }
  }

  function request() {
    if (queued) return
    queued = true
    schedule(sync)
  }

  /** Adds a layer and returns its id. `onBack` runs when Back closes it; return
      `false` from it to refuse (the layer stays and its entry comes back). */
  function register(onBack, rank = BACK_RANK.tab) {
    seq += 1
    layers.push({ id: seq, seq, rank, onBack })
    request()
    return seq
  }

  /** Removes a layer that closed some other way. A no-op for one Back already took. */
  function unregister(id) {
    const before = layers.length
    layers = layers.filter((layer) => layer.id !== id)
    if (layers.length !== before) request()
  }

  /** The window's popstate. */
  function onPopState() {
    if (inFlight) {
      // Our own history.go() landing, not a Back press.
      settle()
      request()
      return
    }
    // A Back press (or several, or Forward): close layers from the top until
    // there are as many as the entry we are now on says.
    const target = depth()
    while (layers.length > target) {
      const layer = top()
      layers = layers.filter((candidate) => candidate !== layer)
      let refused = false
      try {
        refused = layer.onBack() === false
      } catch (caught) {
        console.error('Could not go back.', caught)
      }
      if (refused) {
        layers.push(layer)
        break
      }
    }
    // Re-push for a refusal; undo a Forward (there is nothing to go forward to).
    request()
  }

  return { register, unregister, onPopState, size: () => layers.length }
}

let shared = null

/** The app's one back stack, bound to the window. Null where there is no window
    (the SSR smoke render), which every caller treats as "Back does nothing". */
export function getBackStack() {
  if (shared) return shared
  if (typeof window === 'undefined' || !window.history) return null
  shared = createBackStack({ history: window.history })
  window.addEventListener('popstate', shared.onPopState)
  return shared
}
