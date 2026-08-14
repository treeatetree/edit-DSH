// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS } from '../src/client/index.ts'
import { PluginMarketplacePanel } from '../src/client/PluginMarketplacePanel.tsx'
import { PluginMarketplaceTrigger } from '../src/client/PluginMarketplaceTrigger.tsx'
import type { PluginMarketplacePanelInjected } from '../src/client/PluginMarketplacePanel.tsx'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const EMPTY = { entries: [], sources: [], profile: 'web' }
type CatalogResult =
  | { readonly ok: true; readonly value: typeof EMPTY }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
type MutationResult =
  | {
    readonly ok: true
    readonly value: {
      readonly ok: true
      readonly stdout: string
      readonly stderr: string
      readonly restartRequired: true
    }
  }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const catalog = vi.fn<() => Promise<CatalogResult>>()
    .mockResolvedValue({ ok: true, value: EMPTY })
  const install = vi.fn<(request: { spec: string }) => Promise<MutationResult>>()
    .mockResolvedValue({
      ok: true,
      value: { ok: true, stdout: '', stderr: '', restartRequired: true },
    })
  const remove = vi.fn<(request: { packageName: string }) => Promise<MutationResult>>()
    .mockResolvedValue({
      ok: true,
      value: { ok: true, stdout: '', stderr: '', restartRequired: true },
    })
  ctx.provide('remote.pluginMarketplace', { catalog, add: install, uninstall: remove })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, catalog, install, remove }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'center.cover': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-settings-plugin-marketplace browser plugin', () => {
  it('declares only the services used by the sidebar and cover contributions', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.pluginMarketplace'])
  })

  it('registers the trigger and cover and prefetches the catalog', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const trigger = b.slots.entries('sidebar.footer.action')[0]!
    expect(trigger.component).toBe(PluginMarketplaceTrigger)
    expect(trigger.options).toMatchObject({ id: 'plugin-marketplace', order: -10 })
    expect(trigger.locale).toBe(NS)
    expect(resolveSlotLabel(trigger.options.label)).toBe('插件市场')

    const cover = b.slots.entries('center.cover')[0]!
    expect(cover.component).toBe(PluginMarketplacePanel)
    expect(cover.options).toMatchObject({ id: 'plugin-marketplace' })

    await vi.waitFor(() => { expect(b.catalog).toHaveBeenCalled() })

    const injected = (trigger.inject as unknown as () => PluginMarketplacePanelInjected)()
    await vi.waitFor(() => { expect(injected.lastCatalog?.()).toEqual(EMPTY) })
    await expect(injected.catalog()).resolves.toEqual(EMPTY)
    expect(injected.lastCatalog?.()).toEqual(EMPTY)
    expect(injected.view.getSnapshot()).toBe(false)
    injected.view.open()
    expect(injected.view.getSnapshot()).toBe(true)
    injected.view.close()
    expect(injected.view.getSnapshot()).toBe(false)
    await expect(injected.install('dsh-hello')).resolves.toMatchObject({ ok: true, restartRequired: true })
    expect(injected.lastCatalog?.()).toBeUndefined()
    expect(b.install).toHaveBeenCalledWith({ spec: 'dsh-hello' })
    await expect(injected.remove('dsh-hello')).resolves.toMatchObject({ ok: true })
    expect(injected.lastCatalog?.()).toBeUndefined()
    expect(b.remove).toHaveBeenCalledWith({ packageName: 'dsh-hello' })

    b.catalog.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(injected.catalog()).rejects.toThrow('pluginMarketplace.catalog failed: REMOTE_ERROR: unavailable')
    b.install.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'denied' } })
    await expect(injected.install('dsh-hello')).rejects.toThrow('pluginMarketplace.add failed: REMOTE_ERROR: denied')
    b.remove.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'denied' } })
    await expect(injected.remove('dsh-hello')).rejects.toThrow('pluginMarketplace.uninstall failed: REMOTE_ERROR: denied')
    await b.ctx.fiber.dispose()
  })

  it('follows locale and recovers across late declaration and declarer reload', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(b.slots.entries('center.cover')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('sidebar.footer.action')).toHaveLength(1) })
    await vi.waitFor(() => { expect(b.slots.entries('center.cover')).toHaveLength(1) })
    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('sidebar.footer.action')[0]!.options.label)).toBe('Plugin market')

    stop()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(b.slots.entries('center.cover')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('center.cover')[0]?.component).toBe(PluginMarketplacePanel)
    })

    await fiber.dispose()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(() => b.locale.register(NS, 'zh', {})).not.toThrow()
    await b.ctx.fiber.dispose()
  })

  it('swallows a failed catalog prefetch until the cover retries', async () => {
    const b = await bench()
    b.catalog.mockRejectedValueOnce(new Error('GitHub timeout'))
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(b.catalog).toHaveBeenCalled() })
    const injected = (b.slots.entries('center.cover')[0]!.inject as unknown as () => PluginMarketplacePanelInjected)()
    expect(injected.lastCatalog?.()).toBeUndefined()
    await expect(injected.catalog()).resolves.toEqual(EMPTY)
    expect(injected.lastCatalog?.()).toEqual(EMPTY)
    await b.ctx.fiber.dispose()
  })
})
