# Agent Note: Overlay marketplace packages onto the official npm CLI

Status: implemented

English | [中文](2026-08-14-overlay-marketplace-packages.zh.md)

## Problem

The cloud Web overlay runs published `@deepseek-ai/dsh` from npm. The sidebar **插件市场** entry lives only in fork packages (`dsh-host-plugin-marketplace`, `dsh-client-ui-settings-plugin-marketplace`, plus the `dsh-api-remotes` mount, `dsh-client-connection` privileged-method list, `dsh-client-ui-layout` `center.cover` seat, and `dsh-client-ui-sidebar` footer stack). Those packages are not in the npm tarball, so `/DSH/` cannot show the entry. The VM disk cannot hold a full monorepo build.

## Decision

[`deploy/marketplace/install.sh`](../../../../deploy/marketplace/install.sh) copies already-built package trees into `/opt/dsh/app/node_modules/@deepseek-ai/` and inserts the two `cordis.patch.yml` rows into `dsh-web-app`. The two packages that do not exist in the npm CLI also go into `$DSH_HOME/profiles/web/node_modules/@deepseek-ai/`, because Loader imports extra rows with parent URL `$DSH_HOME/profiles/web/` and Node ESM does not walk into the CLI tree from there. The Host row sets `cliPath` to the overlay CLI and `profile` to `web`. The script also puts `pnpm@11.7.0` on PATH (`npm install -g` when npm exists, otherwise corepack, then `/usr/local/bin/pnpm`), writes `$DSH_HOME/profiles/web/.npmrc` when `DSH_NPM_REGISTRY` is set, copies sibling `deploy/nginx/dsh-web.conf` and `deploy/systemd/dsh-web.service` when those files exist, and deletes `$DSH_HOME/plugin-marketplace-catalog.json` so a new catalog envelope is not served from an old file. systemd PATH includes `/usr/local/bin` so `dsh plugin` can spawn pnpm. The operator builds the packages on a machine that can hold the workspace, then passes the extracted folder to the script from a checkout that contains the current nginx and unit files; the VM never compiles TypeScript.

The copied trees are `dsh-host-plugin-marketplace`, `dsh-client-ui-settings-plugin-marketplace`, `dsh-api-remotes`, `dsh-client-connection`, `dsh-client-ui-layout`, `dsh-client-ui-sidebar`, `dsh-client-ui-settings-models`, and `dsh-client-ui-conversation`. Replacing remotes is required because the browser Remote mount lives in that Client assembly; replacing connection pins `pluginMarketplace/catalog|add|uninstall` to the same loopback Host rewrite as the other privileged methods. Replacing layout declares `center.cover` and compact/split chrome; replacing sidebar stacks footer actions above Settings and paints the compact nav. Replacing models drops the default internal-testing notice; replacing conversation lifts the composer above that nav ([mobile fold shell](../feature/2026-08-14-mobile-fold-shell.md), [drop default welcome notice](../feature/2026-08-14-drop-default-welcome-notice.md)).

## Alternatives considered

**Build the monorepo on the VM and run the fork CLI.** Rejected: the overlay already rejected a full workspace build, and the remaining disk cannot hold it.

**`dsh plugin add` of a `file:` marketplace bundle.** Rejected as the only step: a profile bundle can insert the two rows, but the Client still would not `$mount` `pluginMarketplace` unless `dsh-api-remotes` is replaced, and the marketplace RPC itself refuses `file:` / `link:` specs.

**Publish the fork packages to npm and bump `DSH_NPM_SPEC`.** Deferred: this overlay must work against the already-installed `0.1.0-rc.6` CLI without a registry of private packages.

## Consequences

- Opening the sidebar **插件市场** entry on `http://118.145.156.15/DSH/` uses the fork Host Remote and conversation-column cover.
- Re-running `deploy/install.sh` reinstalls the npm CLI and wipes the copied trees; `marketplace/install.sh` must run again afterward.
- Installing a community plugin still runs that package as user `dsh` after the next process start.

## Testing

Package tests for the marketplace Host and cover remain on those packages. Overlay evidence is a live `/DSH/` boot JSON that lists `plugin-marketplace` and `ui-settings-plugin-marketplace`, plus the conversation-column cover after clicking the sidebar entry. `scripts/dsh-nginx-path-prefix.spec.ts` covers the HTML EventSource patch and the unbuffered `/plugins/events` location.
