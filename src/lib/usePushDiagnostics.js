import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPushDiagnostics, sendTestPush } from './pushDiagnostics.js'

/**
 * The server's view of this account's push setup, for Settings to show.
 *
 * `active` is "push is on for this device": nothing is asked of the server for
 * people who never turned it on. `diagnosis` is the server's answer, `null`
 * while unknown, `false` if the server couldn't be reached. `test()` sends a
 * real notification now and resolves to the server's answer (or null).
 */
export function usePushDiagnostics(active) {
  const [diagnosis, setDiagnosis] = useState(null)
  const [checking, setChecking] = useState(false)
  const [testing, setTesting] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = useCallback(async () => {
    const answer = await fetchPushDiagnostics()
    if (alive.current) setDiagnosis(answer ?? false)
  }, [])

  /* What the "Check again" button runs: the same load, with a busy state to
     disable the button while it is in flight. */
  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      await load()
    } finally {
      if (alive.current) setChecking(false)
    }
  }, [load])

  useEffect(() => {
    if (!active) return undefined
    void load()
    // Forget the answer when push is turned off, so turning it back on never
    // flashes the old one before the new one arrives.
    return () => setDiagnosis(null)
  }, [active, load])

  const test = useCallback(async () => {
    setTesting(true)
    try {
      const answer = await sendTestPush()
      // A successful test also refreshed the picture (devices may have been
      // pruned); a failed one leaves what was already known.
      if (alive.current && answer) setDiagnosis(answer)
      return answer
    } finally {
      if (alive.current) setTesting(false)
    }
  }, [])

  return { diagnosis, checking, testing, refresh, test }
}
