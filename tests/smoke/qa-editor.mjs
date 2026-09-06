/* Manual visual QA for the TaskEditor/EventEditor redesign (grouped
   Schedule/Organize/Details sections). Same throwaway-harness contract as
   qa.mjs: run `npm install --no-save playwright && npx playwright install
   chromium` once, `npx vite --config tests/smoke/dev.vite.config.js` in
   another terminal (mock-backed dev server, port 5183), then
   `node tests/smoke/qa-editor.mjs`. Screenshots land in the gitignored
   tests/smoke/.qa-screenshots/ next to this file. Not part of npm test/CI. */
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const OUT = fileURLToPath(new URL('./.qa-screenshots', import.meta.url))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
page.on('pageerror', (err) => console.log('[pageerror]', err.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console error]', msg.text())
})

await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' })
await page.waitForSelector('.sidebar__brand')

// New task (create) — Title / Schedule / Organize / Details sections.
await page.click('.sidebar__new-task')
await page.waitForSelector('.modal__panel')
await page.screenshot({ path: `${OUT}/ed-01-new-task.png` })
console.log('new task modal captured')

// Same modal, switched to Event via the kind toggle.
await page.click('.editor-kind__options button:has-text("Event")')
await page.waitForSelector('.field__label:has-text("Starts")')
await page.screenshot({ path: `${OUT}/ed-02-new-event.png` })
console.log('new event modal captured')
await page.click('button[aria-label="Close"]')
await page.waitForSelector('.modal', { state: 'detached' })

// Edit an ordinary (non-repeating) task with subtasks/blocked-by data —
// exercises the full Details section stack.
await page.click('button[title="Day"]')
await page.waitForSelector('.day-panel')
await page.click('.block:has-text("Design review")')
await page.waitForSelector('.modal__panel')
await page.screenshot({ path: `${OUT}/ed-03-edit-task.png` })
console.log('edit task modal captured')
await page.click('button[aria-label="Close"]')
await page.waitForSelector('.modal', { state: 'detached' })

// Try to reach a single occurrence of the repeating task ("Standing sync").
// Only present on a day the weekday rule actually matches, so this is
// best-effort — walk forward up to 7 days if it isn't on today's grid.
let foundOccurrence = false
for (let i = 0; i < 7; i++) {
  const block = page.locator('.block:has-text("Standing sync")')
  if (await block.count()) {
    await block.first().click()
    await page.waitForSelector('.modal__panel')
    await page.screenshot({ path: `${OUT}/ed-04-edit-occurrence.png` })
    console.log(`edit occurrence modal captured (+${i}d)`)
    foundOccurrence = true
    await page.click('button[aria-label="Close"]')
    await page.waitForSelector('.modal', { state: 'detached' })
    break
  }
  await page.click('button[aria-label="Next day"], .date-nav button:has-text(">")').catch(() => {})
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
}
if (!foundOccurrence) console.log('Standing sync occurrence not found within a week — skipped')

await browser.close()
console.log('done')
