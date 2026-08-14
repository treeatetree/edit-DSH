import { useSyncExternalStore, type ReactNode } from 'react'
import {
  IconCordisPluginOutline14,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MarketplaceViewStore } from './view-store.ts'
import css from './PluginMarketplaceTrigger.module.css'

/** Injected face for the sidebar marketplace trigger. */
export interface PluginMarketplaceTriggerInjected {
  view: MarketplaceViewStore
}

/** Full trigger props assembled by the sidebar footer-action slot. */
export type PluginMarketplaceTriggerProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'settings.pluginMarketplace'>
  & InjectFace<PluginMarketplaceTriggerInjected>

/** Sidebar-foot control that opens the marketplace over the conversation column. */
export function PluginMarketplaceTrigger({
  wide,
  view,
  t,
}: PluginMarketplaceTriggerProps): ReactNode {
  const open = useSyncExternalStore(view.subscribe, view.getSnapshot)
  return (
    <Tooltip label={t('tab')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={wide ? css.trigger : `${css.trigger} ${css.rail}`}
        aria-pressed={open}
        aria-label={t('tab')}
        data-marketplace-trigger=""
        onClick={() => { view.toggle() }}
      >
        <IconCordisPluginOutline14 size={wide ? 14 : 16} />
        {wide ? <span className={css.label}>{t('tab')}</span> : null}
      </button>
    </Tooltip>
  )
}
