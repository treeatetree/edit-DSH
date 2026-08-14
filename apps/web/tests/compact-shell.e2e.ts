// Keyless browser e2e: a phone-sized viewport paints compact chrome (bottom
// nav + session drawer) and the layout switch forces the desktop three-column
// shell without a model call.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/compact-shell', import.meta.url))
const NAV_EXPECTED = join(SNAPSHOT_DIR, 'compact-nav.expected.md')
const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record')('web e2e: compact phone shell', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold()
    browser = await chromium.launch()
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      locale: ZH_BROWSER_LOCALE,
    })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[data-shell="compact"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('paints the bottom nav and switches to desktop chrome', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-compact-shell'))
    const nav = page.locator('[data-compact-nav]')
    await nav.waitFor({ timeout: 15_000 })
    const aria = await captureStableAria(page, '[data-compact-nav]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(NAV_EXPECTED, aria, MODE)

    await page.getByRole('button', { name: '切换布局' }).click()
    await page.waitForSelector('[data-shell="desktop"]', { timeout: 15_000 })
    expect(await page.locator('[data-compact-nav]').count()).toBe(0)
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['compact-nav.expected.md'])
  })
})
