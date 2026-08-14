/** Plugin marketplace: sidebar trigger plus conversation-column cover. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import {
  PluginMarketplacePanel,
  type PluginMarketplacePanelInjected,
} from './PluginMarketplacePanel.tsx'
import { PluginMarketplaceTrigger } from './PluginMarketplaceTrigger.tsx'
import { createMarketplaceViewStore } from './view-store.ts'
import { en, zh, type PluginMarketplaceLocaleKey } from './locales.ts'

export type {
  PluginMarketplaceSettingsTabInjected,
  PluginMarketplaceSettingsTabProps,
} from './PluginMarketplaceSettingsTab.tsx'
export type {
  PluginMarketplacePanelInjected,
  PluginMarketplacePanelProps,
} from './PluginMarketplacePanel.tsx'
export type {
  PluginMarketplaceTriggerInjected,
  PluginMarketplaceTriggerProps,
} from './PluginMarketplaceTrigger.tsx'
export type { MarketplaceViewStore } from './view-store.ts'
export type { PluginMarketplaceLocaleKey } from './locales.ts'
export { PluginMarketplaceSettingsTab } from './PluginMarketplaceSettingsTab.tsx'
export { PluginMarketplacePanel } from './PluginMarketplacePanel.tsx'
export { PluginMarketplaceTrigger } from './PluginMarketplaceTrigger.tsx'
export { createMarketplaceViewStore } from './view-store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin marketplace copy. */
    'settings.pluginMarketplace': PluginMarketplaceLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginMarketplace'

/** Services required by the sidebar/cover registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginMarketplace']

/** Contribute the marketplace trigger and conversation-column cover. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-marketplace: dictionaries')

  const t = ctx.locale.bind(NS)
  const view = createMarketplaceViewStore()
  let lastSnapshot: Awaited<PluginMarketplacePanelInjected['catalog']> | undefined

  const catalog: PluginMarketplacePanelInjected['catalog'] = async () => refreshCatalog()
  const refreshCatalog = async (): ReturnType<PluginMarketplacePanelInjected['catalog']> => {
    const result = await ctx.remote.pluginMarketplace.catalog()
    if (!result.ok) {
      throw new Error(`pluginMarketplace.catalog failed: ${result.error.code}: ${result.error.message}`)
    }
    lastSnapshot = result.value
    return result.value
  }
  const install: PluginMarketplacePanelInjected['install'] = async (spec) => {
    const result = await ctx.remote.pluginMarketplace.add({ spec })
    if (!result.ok) {
      throw new Error(`pluginMarketplace.add failed: ${result.error.code}: ${result.error.message}`)
    }
    lastSnapshot = undefined
    return result.value
  }
  const remove: PluginMarketplacePanelInjected['remove'] = async (packageName) => {
    const result = await ctx.remote.pluginMarketplace.uninstall({ packageName })
    if (!result.ok) {
      throw new Error(`pluginMarketplace.uninstall failed: ${result.error.code}: ${result.error.message}`)
    }
    lastSnapshot = undefined
    return result.value
  }
  const injected = (): PluginMarketplacePanelInjected => ({
    catalog, install, remove, view, lastCatalog: () => lastSnapshot,
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'plugin-marketplace',
    order: -10,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginMarketplaceTrigger))

  ctx.slots.inject('center.cover', () => ctx.slots.register({
    name: 'center.cover',
    id: 'plugin-marketplace',
    locale: NS,
    inject: injected,
  }, PluginMarketplacePanel))

  void refreshCatalog().catch(() => {
    // Host catalog is retried when the cover mounts or the user presses Retry.
  })
}
