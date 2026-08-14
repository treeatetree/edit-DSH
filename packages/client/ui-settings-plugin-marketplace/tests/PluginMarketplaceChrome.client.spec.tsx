// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginMarketplacePanel, type PluginMarketplacePanelProps } from '../src/client/PluginMarketplacePanel.tsx'
import { PluginMarketplaceTrigger, type PluginMarketplaceTriggerProps } from '../src/client/PluginMarketplaceTrigger.tsx'
import { createMarketplaceViewStore } from '../src/client/view-store.ts'
import { en, type PluginMarketplaceLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: PluginMarketplaceLocaleKey): string => en[key]) as PluginMarketplacePanelProps['t']
const EMPTY = { entries: [], sources: [], profile: 'web' }

function triggerProps(
  overrides: Pick<PluginMarketplaceTriggerProps, 'wide' | 'view'>,
): PluginMarketplaceTriggerProps {
  return { t, ...overrides } as PluginMarketplaceTriggerProps
}

function panelProps(
  overrides: Pick<PluginMarketplacePanelProps, 'view' | 'catalog' | 'install' | 'remove'>,
): PluginMarketplacePanelProps {
  return { t, lastCatalog: () => undefined, ...overrides } as PluginMarketplacePanelProps
}

describe('marketplace view store', () => {
  it('toggles, ignores redundant open/close, and unsubscribes', () => {
    const view = createMarketplaceViewStore()
    const listener = vi.fn()
    const off = view.subscribe(listener)
    expect(view.getSnapshot()).toBe(false)
    view.close()
    expect(listener).not.toHaveBeenCalled()
    view.open()
    expect(view.getSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    view.open()
    expect(listener).toHaveBeenCalledTimes(1)
    view.toggle()
    expect(view.getSnapshot()).toBe(false)
    off()
    view.toggle()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('PluginMarketplaceTrigger and Panel', () => {
  it('opens the cover from the trigger, closes from the header and Escape', async () => {
    const view = createMarketplaceViewStore()
    const catalog = vi.fn(async () => EMPTY)
    render(
      <>
        <PluginMarketplaceTrigger {...triggerProps({ wide: true, view })} />
        <PluginMarketplacePanel
          {...panelProps({
            view,
            catalog,
            install: async () => ({ ok: true, stdout: '', stderr: '', restartRequired: true }),
            remove: async () => ({ ok: true, stdout: '', stderr: '', restartRequired: true }),
          })}
        />
      </>,
    )
    const trigger = screen.getByRole('button', { name: en.tab })
    expect(trigger.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[data-marketplace-panel]')?.getAttribute('data-open')).toBeNull()
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('[data-marketplace-panel]')?.getAttribute('data-open')).toBe('true')
    await screen.findByRole('searchbox', { name: en.search })
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    expect(view.getSnapshot()).toBe(false)
    fireEvent.click(trigger)
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(view.getSnapshot()).toBe(true)
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(view.getSnapshot()).toBe(false)
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(view.getSnapshot()).toBe(false)
  })

  it('renders the rail trigger without a visible label', () => {
    const view = createMarketplaceViewStore()
    render(<PluginMarketplaceTrigger {...triggerProps({ wide: false, view })} />)
    const trigger = screen.getByRole('button', { name: en.tab })
    expect(trigger.textContent).toBe('')
    fireEvent.click(trigger)
    expect(view.getSnapshot()).toBe(true)
  })
})
