/** Viewing-state store for the plugin marketplace center cover. */

export interface MarketplaceViewStore {
  getSnapshot: () => boolean
  subscribe: (listener: () => void) => () => void
  open: () => void
  close: () => void
  toggle: () => void
}

/**
 * Create the open/closed store shared by the sidebar trigger and center cover.
 * @returns a store whose snapshot is `true` while the marketplace covers the conversation column.
 */
export function createMarketplaceViewStore(): MarketplaceViewStore {
  let open = false
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => open,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    open: () => { if (!open) { open = true; emit() } },
    close: () => { if (open) { open = false; emit() } },
    toggle: () => { open = !open; emit() },
  }
}
