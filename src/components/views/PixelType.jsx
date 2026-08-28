import { useEffect, useMemo, useState } from 'react'

/* Short on purpose: Press Start 2P is a wide 8-bit face, and this line sits
   beside the day's hours — anything past ~18 glyphs wraps the hero. */
const ENCOURAGEMENTS = [
  "YOU'VE GOT THIS",
  'ONE BLOCK',
  'START SMALL',
  'STILL TIME',
  'KEEP GOING',
  'BLOCK BY BLOCK',
]

function greetingFor(period) {
  if (period === 'morning') return 'HELLO'
  if (period === 'afternoon') return 'GOOD AFTERNOON'
  return 'GOOD EVENING'
}

/**
 * A typewriter in the pixel face the hero earned — one greeting, then a
 * handful of small nudges. The hours stay the figure; this is the voice.
 */
export function PixelType({ hourMin }) {
  const period = hourMin < 12 * 60 ? 'morning' : hourMin < 17 * 60 ? 'afternoon' : 'evening'
  const lines = useMemo(() => [greetingFor(period), ...ENCOURAGEMENTS], [period])
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [shown, setShown] = useState('')
  const [caretOn, setCaretOn] = useState(true)
  const text = reduced ? lines[0] : shown

  useEffect(() => {
    if (reduced) return undefined

    let cancelled = false
    let line = 0
    let char = 0
    let deleting = false
    let timer

    const wait = (ms, next) => {
      timer = setTimeout(() => {
        if (!cancelled) next()
      }, ms)
    }

    const tick = () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) {
        wait(400, tick)
        return
      }

      const full = lines[line]
      if (!deleting) {
        char += 1
        setShown(full.slice(0, char))
        if (char >= full.length) {
          deleting = true
          wait(15_000, tick)
          return
        }
        wait(72, tick)
        return
      }

      char -= 1
      setShown(full.slice(0, Math.max(0, char)))
      if (char <= 0) {
        deleting = false
        line = (line + 1) % lines.length
        wait(420, tick)
        return
      }
      wait(36, tick)
    }

    wait(480, tick)
    const blink = setInterval(() => setCaretOn((on) => !on), 530)

    return () => {
      cancelled = true
      clearTimeout(timer)
      clearInterval(blink)
    }
  }, [lines, reduced])

  return (
    <p className="hero__pixel" aria-live="polite" aria-label="A short note for today">
      <span className="hero__pixel-text">{text}</span>
      <span
        className={`hero__pixel-caret${caretOn || reduced ? ' hero__pixel-caret--on' : ''}`}
        aria-hidden="true"
      />
    </p>
  )
}
