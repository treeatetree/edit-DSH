// Trusted non-loopback Web access used to remount the internal-testing notice
// on every reload because acknowledgement was process-local. The notice is
// no longer a default onboarding occupancy.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  launchWebScaffold, watchConsole, webSnapshotMode, WELCOME_NOTICE_COPY,
  type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record')('web e2e: remote welcome notice', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      remoteAuthority: 'remote.localhost',
    })
    browser = await chromium.launch()
    page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      locale: ZH_BROWSER_LOCALE,
    })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('#root', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('does not mount the internal-testing notice on a remote browser', async () => {
    const welcome = page.getByRole('dialog', { name: WELCOME_NOTICE_COPY.zh.title })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    expect(await welcome.count()).toBe(0)
    expect(await page.locator('#root').evaluate(root => (root as HTMLElement).inert)).toBe(false)
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
