// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS } from '../src/client/index.ts'
import { PluginMarketplaceSettingsTab } from '../src/client/PluginMarketplaceSettingsTab.tsx'
import type { PluginMarketplaceSettingsTabInjected } from '../src/client/PluginMarketplaceSettingsTab.tsx'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const EMPTY = { entries: [], sources: [], profile: 'web' }
type CatalogResult =
  | { readonly ok: true; readonly value: typeof EMPTY }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
type MutationResult =
  | { readonly ok: true; readonly value: { readonly ok: true; readonly stdout: string; readonly stderr: string; readonly restartRequired: true } }
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
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-plugin-marketplace browser plugin', () => {
  it('declares only the services used by the Settings Remote contribution', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.pluginMarketplace'])
  })

  it('registers a localized tab without reading the Remote eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.plugins.tab')[0]!
    expect(entry.component).toBe(PluginMarketplaceSettingsTab)
    expect(entry.options).toMatchObject({ id: 'marketplace', order: 5 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('插件市场')
    expect(b.catalog).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => PluginMarketplaceSettingsTabInjected)()
    await expect(injected.catalog()).resolves.toEqual(EMPTY)
    expect(b.catalog).toHaveBeenCalledOnce()
    await expect(injected.install('dsh-hello')).resolves.toMatchObject({ ok: true, restartRequired: true })
    expect(b.install).toHaveBeenCalledWith({ spec: 'dsh-hello' })
    await expect(injected.remove('dsh-hello')).resolves.toMatchObject({ ok: true })
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
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('settings.plugins.tab')).toHaveLength(1) })
    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('settings.plugins.tab')[0]!.options.label)).toBe('Plugin market')

    stop()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('settings.plugins.tab')[0]?.component).toBe(PluginMarketplaceSettingsTab)
    })

    await fiber.dispose()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
    expect(() => b.locale.register(NS, 'zh', {})).not.toThrow()
    await b.ctx.fiber.dispose()
  })
})
