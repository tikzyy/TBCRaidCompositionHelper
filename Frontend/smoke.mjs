import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: false, slowMo: 250 })
const page = await browser.newPage()
await page.goto('http://localhost:5173')
await page.waitForSelector('.app-header', { timeout: 10000 })

async function add(cls, spec) {
  await page.selectOption('.add-row select:nth-child(1)', { label: cls })
  if (spec) await page.selectOption('.add-row select:nth-child(2)', { label: spec })
  await page.click('.add-btn')
}

// 9 players → one group gets 4, one gets 5, leaving a free slot for dragging
await page.click('.size-btn:has-text("10-man")')
await add('Shaman',  'Enhancement')
await add('Warrior', 'Fury')
await add('Warrior', 'Fury')
await add('Rogue',   'Any')
await add('Paladin', 'Retribution')
await add('Shaman',  'Restoration')
await add('Priest',  'Shadow')
await add('Mage',    'Arcane')
await add('Druid',   'Balance')
// only 9 players — one group will have 4

await page.click('.optimise-btn')
await page.waitForSelector('.group-card', { timeout: 10000 })

const scoreBefore = await page.locator('.total-score strong').textContent()
const g1Before = await page.locator('.group-card').nth(0).locator('.group-player').count()
const g2Before = await page.locator('.group-card').nth(1).locator('.group-player').count()
console.log(`Before drag — score: ${scoreBefore}  |  Group 1: ${g1Before} players  Group 2: ${g2Before} players`)

// Drag from the fuller group to the emptier group
const fullIdx  = g1Before >= g2Before ? 0 : 1
const emptyIdx = fullIdx === 0 ? 1 : 0

const playerToDrag = page.locator('.group-card').nth(fullIdx).locator('.group-player').first()
const targetCard   = page.locator('.group-card').nth(emptyIdx)

const fromBox = await playerToDrag.boundingBox()
const toBox   = await targetCard.boundingBox()

await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2)
await page.mouse.down()
await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height * 0.6, { steps: 20 })
await page.waitForTimeout(300)
await page.mouse.up()
await page.waitForTimeout(700)  // wait for re-score fetch

const scoreAfter = await page.locator('.total-score strong').textContent()
const g1After = await page.locator('.group-card').nth(0).locator('.group-player').count()
const g2After = await page.locator('.group-card').nth(1).locator('.group-player').count()
console.log(`After drag  — score: ${scoreAfter}  |  Group 1: ${g1After} players  Group 2: ${g2After} players`)

const playerMoved = (g1Before !== g1After)
console.log(playerMoved ? 'Player moved successfully.' : 'ERROR: player did not move.')

await page.screenshot({ path: 'smoke-after-drag.png', fullPage: true })
await browser.close()
console.log('Done.')
