import { useCallback, useEffect, useState } from 'react'

/**
 * The browser's own "install this app" prompt, made available to a button.
 *
 * Chromium fires `beforeinstallprompt` when it decides a site is
 * installable, and hands over an event that can be deferred and replayed
 * later from a real user gesture. Holding onto it is the whole trick: the
 * default banner is suppressed by preventDefault(), and `prompt()` is
 * called from a click instead, so the ask happens where someone went
 * looking for it rather than over the top of the app.
 *
 * `canInstall` is false on browsers that never fire the event — Safari and
 * Firefox install through their own menus instead. That is a real state,
 * not a failure: the caller renders nothing rather than a button that
 * cannot work. `installed` covers the other end, where the app is already
 * installed and there is nothing left to offer.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [installed, setInstalled] = useState(
    () =>
      typeof window !== 'undefined' &&
      // The standalone display mode is what "already installed, and you are
      // looking at the installed copy" reports as. `navigator.standalone` is
      // the iOS-only spelling of the same question.
      (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true),
  )

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault()
      setDeferred(event)
    }
    function onInstalled() {
      setInstalled(true)
      // The saved event is single-use and now spent; dropping it is what
      // takes the button off screen.
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  /** Shows the prompt and resolves to whether it was accepted. The event
      cannot be replayed, so it is cleared either way — a dismissed prompt
      means the browser will fire a fresh one when it judges the moment
      right again, not that this one can be shown twice. */
  const promptInstall = useCallback(async () => {
    if (!deferred) return false
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    return outcome === 'accepted'
  }, [deferred])

  return { canInstall: deferred !== null && !installed, installed, promptInstall }
}
