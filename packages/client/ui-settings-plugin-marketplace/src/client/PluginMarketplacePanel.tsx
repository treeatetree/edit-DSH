import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarketplaceSnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  PluginMarketplaceSettingsTab,
  type PluginMarketplaceSettingsTabInjected,
} from './PluginMarketplaceSettingsTab.tsx'
import type { MarketplaceViewStore } from './view-store.ts'
import css from './PluginMarketplacePanel.module.css'

/** Injected face for the conversation-column marketplace cover. */
export interface PluginMarketplacePanelInjected extends PluginMarketplaceSettingsTabInjected {
  view: MarketplaceViewStore
  lastCatalog: () => MarketplaceSnapshot | undefined
}

/** Full panel props assembled by the center-cover slot. */
export type PluginMarketplacePanelProps =
  PropsRuntime<'center.cover'>
  & PropsLocale<'settings.pluginMarketplace'>
  & InjectFace<PluginMarketplacePanelInjected>

/**
 * Conversation-column cover for the plugin marketplace.
 * Stays mounted while closed (`display: none`) so the last catalog snapshot,
 * search text, and filter survive reopen without blocking the conversation.
 */
export function PluginMarketplacePanel({
  view,
  catalog,
  install,
  remove,
  lastCatalog,
  t,
}: PluginMarketplacePanelProps): ReactNode {
  const open = useSyncExternalStore(view.subscribe, view.getSnapshot)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') view.close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, view])

  return (
    <section
      className={css.panel}
      data-open={open ? 'true' : undefined}
      data-marketplace-panel=""
      aria-hidden={!open}
      aria-label={t('tab')}
    >
      <header className={css.header}>
        <h1 className={css.title}>{t('tab')}</h1>
        <button type="button" className={css.close} onClick={() => { view.close() }}>
          <IconCloseOutline16 size={14} />
          <span className={css.hiddenLabel}>{t('close')}</span>
        </button>
      </header>
      <div className={css.body}>
        <PluginMarketplaceSettingsTab
          catalog={catalog}
          install={install}
          remove={remove}
          lastCatalog={lastCatalog}
          t={t}
        />
      </div>
    </section>
  )
}
