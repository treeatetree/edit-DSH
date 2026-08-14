# Agent Note: Plugin marketplace as a sidebar primary entry

Status: implemented

English | [中文](2026-08-14-plugin-marketplace-primary-entry.zh.md)

## Problem

The marketplace lived as a third tab inside Settings → Plugins. Discovering or installing a community plugin required opening Settings, switching section, then switching tab, and the catalog rendered in the 800px settings panel. GitHub avatars, Open Graph images, language, forks, and topics from the search payload were dropped. Each Host process start refetched GitHub, so opening the tab waited on a cold catalog.

## Decision

`@deepseek-ai/dsh-client-ui-settings-plugin-marketplace` registers a `sidebar.footer.action` trigger (`id: plugin-marketplace`, `order: -10`) directly above Settings, and a `center.cover` list contribution that fills the conversation column. The cover stays mounted while closed (`display: none`) so search text and the last snapshot survive reopen without intercepting pointer events. Escape and the cover header call the shared viewing-state store's `close()`.

`ui-layout` declares `center.cover` as a root-scoped list slot stacked above the `conversation` occupant inside the center track. A contribution must not replace `conversation`; the cover is additive. `shell.overlay` remains the frame-wide float for toasts and the Cordis inventory.

Host `catalog` rows now carry `imageUrl`, `coverUrl`, `owner`, `language`, `updatedAt`, `forks`, and `topics`. Community rows map those fields from the GitHub search payload plus `https://opengraph.githubassets.com/1/{owner}/{repo}` (no extra API). Official rows copy repository-level stars, language, and the owner avatar from one `GET /repos/{owner}/{repo}` beside the existing git-tree read; they do not reuse the monorepo Open Graph image as a per-package cover. Tree, repo, and topic search run concurrently.

`Config.persistCatalog` (default true) writes `$DSH_HOME/plugin-marketplace-catalog.json` with envelope version `1`. `Config.prefetchCatalog` (default true) starts `catalog()` when the Host plugin loads. Tests inject `persist` and set both flags false. A successful add/uninstall clears memory and disk. The browser plugin also prefetches through the Remote and paints `lastCatalog` immediately.

Host RPC names, spec refusal, privileged-method loopback pin, and `restartRequired` stay as recorded in [web plugin marketplace](2026-08-14-web-plugin-marketplace.md).

## Alternatives considered

**Keep the Settings tab and add a sidebar shortcut that opens Plugins on that tab.** Rejected because the settings panel cannot use the conversation column, and the user asked for a primary entry whose whole right-hand region is the market.

**Occupy `conversation` (single) while the market is open.** Rejected because that would unmount ConversationRoot and every seat it declares.

**Put the market in `shell.overlay`.** Rejected because that layer is a click-through frame-wide float; a full-column product panel belongs in the center track.

**Fetch every official `package.json` from GitHub Contents or raw.githubusercontent.com.** Rejected because hundreds of extra requests would make the first catalog slower than the tree+search pair already is; repository-level metadata plus search fields cover avatars and community descriptions without that cost.

**Memory-only cache.** Rejected because a Host restart (the install path already requires one) would make the next open wait on GitHub again.

## Consequences

The sidebar shows **插件市场** above Settings. Opening it covers the conversation column; Settings → Plugins no longer has a marketplace tab. Catalog cards show avatars and, for community/installed GitHub specs, Open Graph images. After a Host restart the disk cache serves until `catalogCacheMs` elapses.

Unauthenticated GitHub quota still applies; the extra `/repos` read is one request per official refresh, not one per package. Overlay deploys that ship the marketplace client must also overlay `ui-layout` and `ui-sidebar` so `center.cover` exists and the trigger stacks above Settings.

## Testing

Package tests cover GitHub field mapping, parallel repo metadata, disk cache reuse/invalidation/corrupt envelopes, prefetch, persist save/clear failures, the sidebar trigger and cover open/close/Escape paths, last-catalog paint, and image `onError` hiding. The web e2e intercepts `pluginMarketplace/catalog` from navigation start and snapshots `[data-marketplace-chrome]` after clicking the sidebar trigger. Coverage gaps remain live GitHub pagination beyond the first 100 topic hits, and an end-to-end `dsh plugin add` against a real registry.
