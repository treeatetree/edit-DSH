# Agent Note: Plugin marketplace live catalog and install failures

Status: implemented

English | [中文](2026-08-14-marketplace-live-catalog-bugs.zh.md)

## Problem

The published `/DSH/` marketplace listed about two hundred official monorepo packages (`acp`, `gateway`, `ui-layout`, …), all with `installSpec: null`. The only installable rows were GitHub topic `dsh-plugin` hits. `dsh plugin add` then failed with `pnpm not found on PATH` because `dsh-web.service` PATH did not include a pnpm shim, and the Host forwarded `Command failed: /opt/dsh/app/node_modules/.bin/dsh plugin …` into the cover. Notices had no dismiss control, so a failed install stayed on screen across filter changes. GitHub Open Graph images repeated the card title and description as a 120px header, and on compact widths the Install control overlapped the first card. The custom-spec form looked like another catalog row when Installed was empty. HTML under `/DSH/` patched `fetch` and `WebSocket` but not `EventSource`, so `/plugins/events` hit the IP vhost's liushui HTML; even a corrected path would have been buffered by `location ^~ /DSH/plugins/`.

Catalog ownership remains [web plugin marketplace](../feature/2026-08-14-web-plugin-marketplace.md) and [plugin marketplace primary entry](../feature/2026-08-14-plugin-marketplace-primary-entry.md). Overlay copy remains [overlay marketplace packages](../process/2026-08-14-overlay-marketplace-packages.md).

## Decision

`Config.officialGroups` defaults to `['bundle']`. Empty means every group except `officialSkipGroups`. Disk cache envelope version is `2` so a prior whole-tree snapshot is a miss.

`runPluginCommand` maps `/pnpm not found/i` to `missing-pnpm` with `pnpm is not installed on PATH`, and other spawn failures to `dsh plugin ${verb} failed`. Overlay `install.sh` / `marketplace/install.sh` enable `pnpm@11.7.0` through corepack and a `/usr/local/bin/pnpm` shim on the systemd PATH.

The cover dismisses notices, labels official `installSpec: null` rows as browse-only, names the custom-spec form, and renders Open Graph images only in expanded details.

nginx HTML injects an `EventSource` constructor that applies the same origin-root prefix rewrite as `fetch` / `WebSocket`. `location = /DSH/plugins/events` proxies without buffering or gzip; other `/DSH/plugins/` bodies stay buffered for gzip.

## Alternatives considered

**Widen `officialSkipGroups` until the list is small.** Rejected because skip-lists drift as groups appear, and the installable official surface is the profile bundle layer, not an allow-by-omission of `packages/`.

**Hard-code an nvm Node bin directory on the systemd PATH.** Rejected because the `dsh` system user does not own that tree; a root `corepack` shim in `/usr/local/bin` is the PATH the unit already searches.

**Leave Open Graph images as collapsed-card headers.** Rejected because GitHub's image already contains title, description, and stars, so the card repeated itself.

## Consequences

Official filter shows the `packages/bundle/*` browse rows (web-app, headless, base) rather than the whole monorepo. Community install requires pnpm on the Host PATH. Mutation errors no longer leak the CLI argv. SSE under `/DSH/` uses the rewritten EventSource URL and an unbuffered location.

Installing a community spec still runs that repository as user `dsh` after the next process start.

## Testing

Host tests cover `officialGroups` filtering, cache envelope `2` rejecting version `1`, `missing-pnpm`, and sanitized `command-failed`. Client tests cover browse-only copy, cover images only after expand, dismiss, and `missing-pnpm` local diagnostics. `scripts/dsh-nginx-path-prefix.spec.ts` asserts the EventSource inject and `/plugins/events` buffering. Coverage gaps remain live GitHub pagination and an end-to-end `dsh plugin add` against a real registry.
