import { useEffect } from 'react'

/* The browser-tab twin of ClockIcon (see components/icons.jsx): redraws the
   /favicon.svg clock mark as an inline SVG data URL with hour/minute hands
   at the actual local time. A static file can't tick, so without this the
   tab icon would sit frozen while the in-app brand marks move around it.

   Deliberately minute-accurate, not second-accurate: at 16–32px a second
   hand is a smudge, and rewriting the icon URL every second makes some
   browsers flicker the tab. The in-app ClockIcon keeps the per-second sweep;
   the tab icon re-renders on the minute boundary (plus once at mount). */

const INK = '#0b0b0b'

/** Hand angles (degrees clockwise from 12 o'clock) for a given instant —
    shared by ClockIcon and the tab favicon, exported for tests. The minute
    hand sweeps with the seconds and the hour hand with the minutes, so the
    mark reads as a real clock, not a logo frozen at ~4 o'clock. */
export function clockHandAngles(date) {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000
  const minutes = date.getMinutes() + seconds / 60
  const hours = (date.getHours() % 12) + minutes / 60
  return { hour: hours * 30, minute: minutes * 6, second: (seconds % 60) * 6 }
}

/** Render the clock favicon for an instant — exported for tests. Geometry
    mirrors public/favicon.svg's 32-unit space (white rounded plate, ring at
    r=9, stroke 2, round caps) with a hub dot matching ClockIcon's. */
export function buildClockFavicon(date) {
  const { hour: hourDeg, minute: minuteDeg } = clockHandAngles(date)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="#ffffff"/>` +
    `<circle cx="16" cy="16" r="9" fill="none" stroke="${INK}" stroke-width="2"/>` +
    `<g stroke="${INK}" stroke-width="2" stroke-linecap="round">` +
    `<line x1="16" y1="16" x2="16" y2="11" transform="rotate(${hourDeg} 16 16)"/>` +
    `<line x1="16" y1="16" x2="16" y2="9.5" transform="rotate(${minuteDeg} 16 16)"/>` +
    `</g>` +
    `<circle cx="16" cy="16" r="1.4" fill="${INK}"/>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function paint(date) {
  let link = document.querySelector("link[rel='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = 'image/svg+xml'
  link.href = buildClockFavicon(date)
}

export function useLiveFavicon() {
  useEffect(() => {
    paint(new Date())
    let timer
    const tick = () => {
      paint(new Date())
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 250)
    }
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 250)
    const onVisible = () => {
      if (!document.hidden) paint(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
