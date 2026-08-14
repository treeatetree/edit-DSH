# @deepseek-ai/dsh-client-ui-settings-plugin-marketplace

English | [中文](README.zh.md)

**Plugin market** tab for Web Settings. The browser plugin registers one localized `settings.plugins.tab` contribution with id `marketplace` and `order: 5`; the Plugins section owns the navigation entry and tab chrome. It performs no Remote read during plugin activation. Selecting the tab for the first time mounts it and lazily calls `ctx.remote.pluginMarketplace.catalog()` through [`api-remotes`](../../api/remotes/README.md).

The tab lists official packages from [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) as browse-only rows and GitHub repositories tagged `dsh-plugin` as installable `github:owner/repo` specs. Install and remove call `pluginMarketplace.install` / `pluginMarketplace.remove`; the Host runs `dsh plugin --profile <name>`. Copy is Chinese-first. Loading, empty, no-match, source-failure, and generic failure states stay local to the mounted component. The registration uses `ctx.slots.inject()`, so it follows late tab declaration, redeclaration, locale changes, and teardown without importing the section owner.

A successful mutation reports that the Web process must restart before the new profile layer loads.

## Model Experience

None, as this package only visualizes and mutates a Host-owned profile catalog in browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Official monorepo packages are not install targets** — they already ship inside the composed CLI bundles; the tab only links to GitHub.
- **Install does not hot-load** — `dsh plugin` writes the profile layer; the running Loader tree changes on the next Host process start.
- **Catalog rows are a point-in-time GitHub + profile snapshot** — the tab does not subscribe to GitHub or profile changes; retry or reopen Settings to refresh.
