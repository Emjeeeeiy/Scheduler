import { useEffect, useRef } from 'react'
import {
  MAX_RIBBON_DOTS,
  gridLayout,
  influence,
  makeRibbonBuffer,
  ribbonDots,
} from '../../lib/dotField.js'

/* How far the pointer reaches, and what it does to a dot inside that circle. */
const REACH = 150
const PUSH = 10
const BRIGHTEN = 0.45
const GROW = 1.4
/* The most opaque a dot may get once the pointer has lifted it. */
const ALPHA_CEIL = 0.9
/* Ribbon dots are drawn in this many opacity bands, one path and one fill each:
   a few dozen fills a frame rather than thousands. */
const BANDS = 8
const TAU = Math.PI * 2
/* A frozen moment of the ribbon for reduced motion — chosen for a pleasing fold,
   not for any meaning. */
const STILL_TIME = 4000

/** The 404 page's background: the app's 22px dot grid with a ribbon of dots
    twisting across it. The ribbon is the one thing that answers the cursor — it
    parts around it and glows — while the grid stays perfectly still. Decorative
    only — `aria-hidden`, and CSS gives it `pointer-events: none`, since this app
    is built on drag and drop and a backdrop must never be what a pointer hits.

    One canvas and one effect. The grid never changes, so it is painted once into
    an offscreen canvas and each frame copies it; only the ribbon is recomputed.
    With reduced motion it paints one still frame and never starts a loop or
    listens to the pointer. Without a 2D context (an old browser, a test DOM) it
    draws nothing and the page is just its text. */
export function DotField() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return undefined

    /* Read once, like PixelType: the preference changing mid-visit is rare enough
       that a reload is a fair price for not re-wiring a loop. */
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

    const grid = document.createElement('canvas')
    const buffer = makeRibbonBuffer()
    const band = new Uint8Array(MAX_RIBBON_DOTS)
    const pointer = { x: 0, y: 0, toX: 0, toY: 0, strength: 0, target: 0, seen: false }

    let width = 0
    let height = 0
    let ratio = 1
    let dotColour = ''
    let ribbonColour = 'currentcolor'
    let frame = 0
    let last = 0

    /* The tokens, as the current theme resolves them. Read from the element so a
       light/dark switch is picked up without this file knowing any colour. */
    function readColours() {
      const style = getComputedStyle(canvas)
      dotColour = style.getPropertyValue('--color-dot').trim()
      // The ribbon is coral, the grid under it stays neutral.
      ribbonColour = style.getPropertyValue('--color-accent').trim() || 'currentcolor'
    }

    function paintGrid() {
      const g = grid.getContext('2d')
      if (!g || !dotColour) return
      g.setTransform(ratio, 0, 0, ratio, 0, 0)
      g.clearRect(0, 0, width, height)
      g.fillStyle = dotColour
      const { cols, rows, pitch, x0, y0 } = gridLayout(width, height)
      g.beginPath()
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = x0 + col * pitch
          // moveTo first: without it each arc is joined to the last by a line,
          // and the fill draws the slivers between them.
          g.moveTo(x + 0.9, y0 + row * pitch)
          g.arc(x, y0 + row * pitch, 0.9, 0, TAU)
        }
      }
      g.fill()
    }

    function draw(timeMs) {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.globalAlpha = 1
      if (dotColour) ctx.drawImage(grid, 0, 0, width, height)

      const count = ribbonDots(width, height, timeMs, buffer)
      const live = pointer.strength > 0.003

      // Push, brighten and swell the ribbon's dots near the pointer, and sort
      // them into opacity bands as we go. Only the ribbon answers the cursor: the
      // grid underneath stays exactly as painted.
      for (let i = 0; i < count; i += 1) {
        const at = i * 4
        let alpha = buffer[at + 2]
        if (live) {
          const dx = buffer[at] - pointer.x
          const dy = buffer[at + 1] - pointer.y
          const distance = Math.hypot(dx, dy)
          const k = influence(distance, REACH) * pointer.strength
          if (k > 0) {
            // Directly under the pointer there is no "away" to push toward.
            if (distance > 0.001) {
              buffer[at] += (dx / distance) * PUSH * k
              buffer[at + 1] += (dy / distance) * PUSH * k
            }
            alpha += BRIGHTEN * k
            buffer[at + 3] += GROW * k
          }
        }
        alpha = Math.min(ALPHA_CEIL, alpha)
        band[i] = alpha < 0.012 ? 255 : Math.min(BANDS - 1, Math.floor((alpha / ALPHA_CEIL) * BANDS))
      }

      ctx.fillStyle = ribbonColour
      for (let b = 0; b < BANDS; b += 1) {
        ctx.globalAlpha = ((b + 0.5) / BANDS) * ALPHA_CEIL
        ctx.beginPath()
        for (let i = 0; i < count; i += 1) {
          if (band[i] !== b) continue
          const at = i * 4
          ctx.moveTo(buffer[at] + buffer[at + 3], buffer[at + 1])
          ctx.arc(buffer[at], buffer[at + 1], buffer[at + 3], 0, TAU)
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    function tick(now) {
      frame = 0
      // Easing is per millisecond, not per frame, so a 144Hz screen does not
      // chase the pointer faster than a 60Hz one. The clamp stops a tab that was
      // asleep from lurching on its first frame back.
      const dt = Math.min(64, last ? now - last : 16.7)
      last = now
      const follow = 1 - Math.pow(1 - 0.18, dt / 16.7)
      pointer.x += (pointer.toX - pointer.x) * follow
      pointer.y += (pointer.toY - pointer.y) * follow
      pointer.strength += (pointer.target - pointer.strength) * (1 - Math.pow(1 - 0.12, dt / 16.7))
      draw(now)
      frame = requestAnimationFrame(tick)
    }

    function start() {
      if (frame || document.hidden || !width) return
      last = 0
      frame = requestAnimationFrame(tick)
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    }

    function resize() {
      width = canvas.clientWidth
      height = canvas.clientHeight
      if (!width || !height) {
        stop()
        return
      }
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      grid.width = canvas.width
      grid.height = canvas.height
      paintGrid()
      if (reduced) draw(STILL_TIME)
      else start()
    }

    function recolour() {
      readColours()
      paintGrid()
      if (reduced && width) draw(STILL_TIME)
    }

    function aim(event) {
      const box = canvas.getBoundingClientRect()
      pointer.toX = event.clientX - box.left
      pointer.toY = event.clientY - box.top
      // The first sighting snaps, so the circle never glides in from the corner.
      if (!pointer.seen) {
        pointer.x = pointer.toX
        pointer.y = pointer.toY
        pointer.seen = true
      }
      pointer.target = 1
    }

    function release() {
      pointer.target = 0
    }

    function onPointerEnd(event) {
      // A mouse that stops is still pointing; a finger that lifts is gone.
      if (event.pointerType !== 'mouse') release()
    }

    function onVisibility() {
      if (document.hidden) stop()
      else start()
    }

    readColours()
    resize()

    const themeWatch = new MutationObserver(recolour)
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)')
    scheme?.addEventListener?.('change', recolour)

    // The canvas's own size is what matters, not the window's, so watch it.
    const sizeWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    sizeWatch?.observe(canvas)
    if (!sizeWatch) window.addEventListener('resize', resize)

    if (!reduced) {
      window.addEventListener('pointermove', aim, { passive: true })
      window.addEventListener('pointerdown', aim, { passive: true })
      window.addEventListener('pointerup', onPointerEnd)
      window.addEventListener('pointercancel', onPointerEnd)
      window.addEventListener('blur', release)
      document.documentElement.addEventListener('pointerleave', release)
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      stop()
      themeWatch.disconnect()
      scheme?.removeEventListener?.('change', recolour)
      sizeWatch?.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', aim)
      window.removeEventListener('pointerdown', aim)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
      window.removeEventListener('blur', release)
      document.documentElement.removeEventListener('pointerleave', release)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="dot-field" aria-hidden="true" />
}
