# Agent Note: Plugin marketplace in Web Settings

Status: implemented

English | [中文](2026-08-14-web-plugin-marketplace.zh.md)

## Problem

Users who wanted a third-party or extra first-party plugin had to know `dsh plugin --profile <name> add <spec>`, know which GitHub repositories were tagged for this harness, and restart the process. Settings already had **Plugin configuration** and **Plugin list**, but neither one discovered packages outside the live Loader tree or mutated the profile layer.

The official repository at `deepseek-ai/deepseek-harness` is the harness source, not a VS Code-style marketplace. Its `packages/` tree is already composed by shipped bundles; `dsh plugin add` cannot install those in-tree packages. Community plugins that *are* installable live as separate GitHub repositories, conventionally tagged `dsh-plugin`.

## Decision

A Host Remote `@deepseek-ai/dsh-host-plugin-marketplace` publishes `pluginMarketplace/catalog`, `pluginMarketplace/add`, and `pluginMarketplace/uninstall`. Presentation of that catalog is a sidebar primary entry and conversation-column cover owned by `@deepseek-ai/dsh-client-ui-settings-plugin-marketplace`; see [plugin marketplace primary entry](2026-08-14-plugin-marketplace-primary-entry.md).

`catalog` merges three sources and never rejects the RPC because GitHub failed. Why the official default is the bundle group, and how live install/SSE failures are mapped, is recorded in [plugin marketplace live catalog bugs](../bug-fix/2026-08-14-marketplace-live-catalog-bugs.md).

- **Official** — the GitHub git tree of `packages/<group>/<pkg>/package.json` in the configured repository (default `deepseek-ai/deepseek-harness`). Rows are browse-only (`installSpec: null`) because those packages already ship inside the CLI bundles. Config `officialGroups` defaults to `['bundle']` so the official list is the profile layer, not the whole monorepo. An empty `officialGroups` keeps every group except `officialSkipGroups` (`boot`, `examples`, `test-support`, `typert`, and `util` by default).
- **Community** — GitHub repository search `topic:<githubTopic>` (default `dsh-plugin`). Each hit is installable as `github:owner/repo` except `officialRepository` itself. How `add` fetches that spec is recorded in [marketplace GitHub tarball install](../bug-fix/2026-08-15-marketplace-github-tarball-install.md).
- **Installed** — dependencies in `$DSH_HOME/profiles/<profile>/package.json`. These rows can be removed.

`add` and `uninstall` spawn `dsh plugin --profile <name> add|remove` through `execFile` (no shell). Specs are restricted to registry names, optional versions/tags, and `github:owner/repo[#ref]`. Relative paths, `file:`, `link:`, and shell metacharacters are refused before spawn. A successful mutation returns `restartRequired: true`; the running Loader does not hot-load a newly added bundle.

Every deployment-varying choice is a `Config` field, including `githubToken` (empty string sends unauthenticated requests), `officialGroups`, `catalogCacheMs`, `installTimeoutMs`, and `cliPath`. Tests inject `fetcher` and `run` on the Gateway constructor; production uses `fetch` and `runNativeCommand`. A missing Host `pnpm` maps to `missing-pnpm`; other `dsh plugin` failures use `dsh plugin ${verb} failed` rather than the spawned argv.

The three Remotes join `PRIVILEGED_METHODS` as `pluginMarketplace/catalog|add|uninstall` (Typert endpoints use `namespace/method`; `install` and `remove` are reserved on the Client namespace Service) so a LAN caller cannot list the profile dependencies or install packages as the Host process user. nginx that rewrites `Host` to loopback continues to reach them.

## Alternatives considered

**Treat the official monorepo as installable `dsh plugin add` specs.** Rejected because those packages are already composed by `dsh-base` / `dsh-web-app`. Adding them again as profile dependencies would duplicate the in-tree modules and still not replace the shipped copies.

**A Settings navigation row or Plugins tab named Marketplace.** Rejected for the Host/RPC change; the later presentation decision is recorded in [plugin marketplace primary entry](2026-08-14-plugin-marketplace-primary-entry.md).

**Hot-load a newly added bundle without restart.** Rejected for this change: Loader composition is a process-start fact, and teaching the Host to mount an arbitrary profile dependency after `dsh plugin add` is a separate runtime project. The UI states the restart requirement instead of implying the new plugin is live.

**Let the browser call GitHub and `dsh plugin` directly.** Rejected because the GitHub token, profile directory, and process-user install privilege belong on the Host, behind the loopback pin.

**Install from arbitrary `file:` / `link:` / relative paths.** Rejected because those specs are a local code-execution channel; the marketplace allowlist is the Host's refusal, not a UI convenience.

## Consequences

A user opens **插件市场** from the sidebar, searches or filters official / community / installed rows, installs a `github:owner/repo` or registry spec, and removes a profile dependency. Official rows link to GitHub only. After a successful mutation the Host process that loaded the profile must restart before the new layer appears in **Plugin list**.

Unauthenticated GitHub API quota (60 requests/hour) applies unless `githubToken` is set; exhausted quota appears as a failed `sources` row, not an empty product. Catalog snapshots cache for `catalogCacheMs` (default 10 minutes), persist under `$DSH_HOME` when `persistCatalog` is true, and clear after a successful install or remove.

Installing a community package runs arbitrary code as the `dsh` process user on the next start. `/DSH/` remains unauthenticated; the loopback pin is the only network fence on these Remotes.

## Testing

Package tests cover spec refusal, catalog merge and GitHub failure recording, `officialGroups` filtering, `dsh plugin` spawn arguments, `missing-pnpm` / sanitized `command-failed` mapping, cache reuse and invalidation, the marketplace cover's loading/error/retry/filter/install/remove/dismiss paths, and the privileged-method loopback pin. The web e2e intercepts `pluginMarketplace/catalog` and snapshots `[data-marketplace-chrome]` so GitHub card lists cannot flake the golden. Coverage gaps: live GitHub pagination beyond the first 100 topic hits, and an end-to-end `dsh plugin add` against a real registry (that remains a manual deploy check).
