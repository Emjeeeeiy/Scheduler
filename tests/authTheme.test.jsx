/* The sign-in screen is the first thing anyone sees, and for a long time it was a
 * fixed light frame behind a fixed light boot splash — so someone who had chosen
 * Dark in Settings met light, then dark. Two things are pinned here:
 *
 * - the screen takes the app's own tokens (no colour of its own, no pinned
 *   `color-scheme`), so it is light, dark, or follows the OS exactly as
 *   Settings → Appearance says, including after signing out;
 * - there is no splash: nothing in the page, the bundle's entry or the app shell
 *   plays a launch animation, and the first frame is the theme's page colour
 *   rather than a flash of white.
 *
 * These read the shipped files rather than rendering them: jsdom does not run
 * the cascade, and what is worth holding to account is what the stylesheet and
 * the page declare.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

const authCss = read('src/styles/auth.css')
/** The `.auth-shell { … }` rule, and nothing else. */
const shellRule = authCss.slice(authCss.indexOf('.auth-shell {'), authCss.indexOf('}', authCss.indexOf('.auth-shell {')) + 1)

describe('the sign-in screen follows the theme', () => {
  it('declares no colour tokens of its own on .auth-shell', () => {
    expect(shellRule).toMatch(/background:\s*var\(--color-page\)/)
    expect(shellRule).not.toMatch(/--color-[\w-]+\s*:/)
    expect(shellRule).not.toMatch(/--shadow-[\w-]+\s*:/)
  })

  it('does not pin a colour scheme, so form controls and scrollbars follow the theme too', () => {
    expect(authCss).not.toMatch(/color-scheme:\s*light/)
  })

  it('does not hold the page background light behind itself', () => {
    expect(authCss).not.toMatch(/body:has\(\.auth-shell\)/)
  })

  it('has no literal light surface left on it, the Google button included', () => {
    const google = authCss.slice(authCss.indexOf('.google-button {'), authCss.indexOf('}', authCss.indexOf('.google-button {')))
    expect(google).toMatch(/background:\s*var\(--color-surface-1\)/)
    expect(google).toMatch(/color:\s*var\(--color-text-primary\)/)
    expect(google).not.toMatch(/#fff\b|#1f1f1f/i)
    expect(authCss).not.toMatch(/#f9f9f7|#ececec/i)
  })
})

describe('there is no boot splash', () => {
  const html = read('index.html')

  it('has no splash markup, styles or animation in the page', () => {
    expect(html).not.toMatch(/boot-splash/i)
    expect(html).not.toMatch(/@keyframes\s+boot-/)
    expect(html).not.toMatch(/boot-skip-splash/)
  })

  it('still stamps the stored theme onto <html> before first paint, and gives it the theme\'s page colour', () => {
    // A classic, render-blocking script in <head> (no async/defer/module), kept
    // as a file so the CSP in vercel.json needs no inline-script hash.
    expect(html).toMatch(/<head>[\s\S]*<script src="\/theme-boot\.js"><\/script>[\s\S]*<\/head>/)
    const boot = read('public/theme-boot.js')
    expect(boot).toMatch(/localStorage\.getItem\('cadence-app:theme'\)/)
    expect(boot).toMatch(/setAttribute\('data-theme'/)
    expect(html).toMatch(/html\[data-theme='dark'\]\s*\{\s*background:\s*#050505/)
    expect(html).toMatch(/prefers-color-scheme:\s*dark\)\s*\{\s*html:not\(\[data-theme\]\)/)
  })

  it('has no splash module left, and the app shell no longer mounts one', () => {
    expect(existsSync(resolve(process.cwd(), 'src/lib/bootSplash.js'))).toBe(false)
    expect(read('src/App.jsx')).not.toMatch(/BootSplash|dismissBootSplash/)
  })
})
