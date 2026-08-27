import { chromium } from 'playwright'

const OUT = 'C:/Users/user/AppData/Local/Temp/claude/c--Users-user-Documents-Projects-System-scheduler/74efd923-689d-43dd-9756-1178f79f3bf7/scratchpad'

const browser = await chromium.launch()
// A fresh context has empty localStorage — exactly the "first-time visitor"
// case the dark-default change is supposed to cover.
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
page.on('pageerror', (err) => console.log('[pageerror]', err.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console error]', msg.text())
})

await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' })
await page.waitForSelector('.sidebar__brand')

// Confirm the app actually landed on dark with no stored preference.
const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
const storedTheme = await page.evaluate(() => localStorage.getItem('cadence-app:theme'))
console.log('data-theme attr:', dataTheme, '| stored:', storedTheme)

await page.screenshot({ path: `${OUT}/rd-01-dashboard-dark-default.png`, fullPage: true })
console.log('dashboard (dark, first-visit default) captured')

// Zoomed crop of the hero card + stat tiles to inspect the glow and icons closely.
await page.locator('.hero').screenshot({ path: `${OUT}/rd-02-hero-crop.png` })
await page.locator('.tile-row').first().screenshot({ path: `${OUT}/rd-03-tiles-crop.png` })
console.log('hero + tiles crops captured')

// Hover a stat tile to check the hover shadow/background step.
await page.hover('.stat-tile')
await page.waitForTimeout(150)
await page.locator('.tile-row').first().screenshot({ path: `${OUT}/rd-04-tile-hover.png` })
console.log('tile hover captured')

await page.click('button[title="Week"]')
await page.waitForSelector('.week')
await page.screenshot({ path: `${OUT}/rd-05-week-dark.png`, fullPage: true })
console.log('week (dark) captured')

await page.click('button[title="Month"]')
await page.waitForSelector('.month')
await page.screenshot({ path: `${OUT}/rd-06-month-dark.png`, fullPage: true })
console.log('month (dark) captured')

await page.click('button[title="Day"]')
await page.waitForSelector('.day-panel')
await page.screenshot({ path: `${OUT}/rd-07-day-dark.png`, fullPage: true })
console.log('day (dark) captured')

// New task modal — check card/input radius + Space Mono rendering in a dialog.
await page.click('.sidebar__new-task')
await page.waitForSelector('.modal__panel')
await page.screenshot({ path: `${OUT}/rd-08-modal-dark.png` })
console.log('modal (dark) captured')
await page.click('button[aria-label="Close"]')

// Switch to light and confirm it's untouched/still available.
await page.click('button[title^="Theme:"]') // dark -> system
await page.click('button[title^="Theme:"]') // system -> light
await page.waitForTimeout(100)
await page.click('button[title="Dashboard"]')
await page.waitForSelector('.hero')
await page.screenshot({ path: `${OUT}/rd-09-dashboard-light.png`, fullPage: true })
console.log('dashboard (light, still works) captured')

// Confirm scrollbar hiding didn't break scrolling: scroll the week grid.
await page.click('button[title="Week"]')
await page.waitForSelector('.grid-scroll')
const scrollInfo = await page.evaluate(() => {
  const el = document.querySelector('.grid-scroll')
  el.scrollTop = 100
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
})
console.log('scroll test (should be scrollable, scrollTop=100):', JSON.stringify(scrollInfo))

// Confirm Space Mono actually loaded and is being used.
const fontCheck = await page.evaluate(() => {
  const body = getComputedStyle(document.body)
  return { fontFamily: body.fontFamily, fontsReady: document.fonts.check('16px "Space Mono"') }
})
console.log('font check:', JSON.stringify(fontCheck))

await browser.close()
console.log('done')
