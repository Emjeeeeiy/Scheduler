import { useEffect, useState } from 'react'

/**
 * Whether an element has scrolled into view yet; once it has, it stays true.
 *
 * Returns `[ref, seen]` — hand `ref` to the element (a callback ref, so an
 * element that mounts later, like a chart that had no data a moment ago, is
 * picked up too) and let `seen` pick the class that plays its entrance.
 *
 * It exists because an entrance that plays on mount is spent on a chart nobody
 * can see: the Dashboard's Trends sit under the fold, and on a phone behind a
 * "Show chart" button, so they would finish animating before they were looked at.
 * A hidden element (`display: none`) never intersects, so the same wait covers
 * the folded chart.
 *
 * With no `IntersectionObserver` (jsdom, an old browser, a server render) there
 * is nothing to wait for, so `seen` starts true and nothing is ever held back.
 */
export function useRevealOnView() {
  const [node, setNode] = useState(null)
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (seen || !node) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setSeen(true)
        observer.disconnect()
      },
      // Not at the very edge: a chart whose top has just peeked in is not yet read.
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, seen])

  return [setNode, seen]
}
