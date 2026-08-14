/** Plugin marketplace tab registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import {
  PluginMarketplaceSettingsTab,
  type PluginMarketplaceSettingsTabInjected,
} from './PluginMarketplaceSettingsTab.tsx'
import { en, zh, type PluginMarketplaceLocaleKey } from './locales.ts'

export type {
  PluginMarketplaceSettingsTabInjected,
  PluginMarketplaceSettingsTabProps,
} from './PluginMarketplaceSettingsTab.tsx'
export type { PluginMarketplaceLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin marketplace Settings copy. */
    'settings.pluginMarketplace': PluginMarketplaceLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginMarketplace'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginMarketplace']

/** Contribute the lazy marketplace tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-marketplace: dictionaries')

  const t = ctx.locale.bind(NS)
  const catalog: PluginMarketplaceSettingsTabInjected['catalog'] = async () => {
    const result = await ctx.remote.pluginMarketplace.catalog()
    if (!result.ok) {
      throw new Error(`pluginMarketplace.catalog failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const install: PluginMarketplaceSettingsTabInjected['install'] = async (spec) => {
    const result = await ctx.remote.pluginMarketplace.install({ spec })
    if (!result.ok) {
      throw new Error(`pluginMarketplace.install failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const remove: PluginMarketplaceSettingsTabInjected['remove'] = async (packageName) => {
    const result = await ctx.remote.pluginMarketplace.remove({ packageName })
    if (!result.ok) {
      throw new Error(`pluginMarketplace.remove failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const injected = (): PluginMarketplaceSettingsTabInjected => ({ catalog, install, remove })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'marketplace',
    order: 5,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginMarketplaceSettingsTab))
}
