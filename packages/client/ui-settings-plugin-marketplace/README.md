# @deepseek-ai/dsh-client-ui-settings-plugin-marketplace

English | [中文](README.zh.md)

**Plugin market** as a sidebar primary entry. The browser plugin registers a localized `sidebar.footer.action` trigger (`id: plugin-marketplace`, `order: -10`) above Settings, and a `center.cover` panel that fills the conversation column. It prefetches `ctx.remote.pluginMarketplace.catalog()` through [`api-remotes`](../../api/remotes/README.md) during plugin activation and keeps the last snapshot so reopening the cover does not wait on GitHub.

The cover lists official packages from [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) as browse-only rows and GitHub repositories tagged `dsh-plugin` as installable `github:owner/repo` specs. Cards show the GitHub owner avatar, Open Graph image when the row names a repository, description, stars, and language. Install and remove call `pluginMarketplace.add` / `pluginMarketplace.uninstall`; the Host runs `dsh plugin --profile <name>`. Copy is Chinese-first. Loading, empty, no-match, source-failure, and generic failure states stay local to the mounted cover. Both registrations use `ctx.slots.inject()`, so they follow late slot declaration, redeclaration, locale changes, and teardown.

A successful mutation reports that the Web process must restart before the new profile layer loads. Escape and the cover header close the panel without unmounting it, so search text and the last catalog survive reopen.

## Model Experience

None, as this package only visualizes and mutates a Host-owned profile catalog in the Web shell and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Official monorepo packages are not install targets** — they already ship inside the composed CLI bundles; the cover only links to GitHub.
- **Install does not hot-load** — `dsh plugin` writes the profile layer; the running Loader tree changes on the next Host process start.
- **Catalog rows are a point-in-time GitHub + profile snapshot** — the cover does not subscribe to GitHub or profile changes; retry refreshes the Host cache.
