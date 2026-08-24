import { useEffect, useState } from 'react'
import { nowMin, todayKey } from './date.js'

/** Live clock for the now-line, ticking on the minute boundary rather than
    every 60s from mount, so the line moves when the minute actually changes.
    Also re-reads the day key so a tab left open overnight rolls over. */
export function useNow() {
  const [now, setNow] = useState(() => ({ key: todayKey(), min: nowMin() }))

  useEffect(() => {
    let timer
    const tick = () => {
      setNow({ key: todayKey(), min: nowMin() })
      const msToNextMinute = 60_000 - (Date.now() % 60_000)
      timer = setTimeout(tick, msToNextMinute + 50)
    }
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
    return () => clearTimeout(timer)
  }, [])

  return now
}
