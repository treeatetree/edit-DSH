# Agent Note: Marketplace GitHub install via archive tarball

Status: implemented

English | [中文](2026-08-15-marketplace-github-tarball-install.zh.md)

## Problem

The marketplace cover's Install control runs `dsh plugin add github:owner/repo`, and pnpm resolves that spec with `git ls-remote` / clone. On the published `/DSH/` host, `git ls-remote https://github.com/…` stalls past the Host `installTimeoutMs` (default five minutes) while `https://codeload.github.com/owner/repo/tar.gz/HEAD` returns in under a second. The cover showed only **正在安装…**, captured no pnpm stdio until exit, and replaced the catalog with a loading row after success, so a hung git fetch looked identical to a working install. The community topic search also listed `officialRepository` (`deepseek-ai/deepseek-harness`) as an installable `github:` row; adding that spec would clone the whole harness.

Catalog ownership remains [web plugin marketplace](../feature/2026-08-14-web-plugin-marketplace.md). Live PATH / SSE mapping remains [marketplace live catalog bugs](2026-08-14-marketplace-live-catalog-bugs.md).

## Decision

`resolveInstallTarget` rewrites an accepted `github:owner/repo[#ref]` to `https://codeload.github.com/owner/repo/tar.gz/<ref-or-HEAD>` before `dsh plugin add`. The Remote still accepts only the `github:` form; arbitrary `https://` specs stay refused. `parseCommunitySearch` drops a hit whose `full_name` matches `officialRepository` case-insensitively. Disk cache envelope version is `3`.

The cover keeps the last catalog while a mutation runs, shows elapsed `m:ss` plus a local hint that pnpm output is not streamed, and does not switch the body to the loading row after success. Overlay `install.sh` installs a real `pnpm@11.7.0` with `npm install -g` when npm exists, and writes the profile `.npmrc` `registry=` line when `DSH_NPM_REGISTRY` is set.

## Alternatives considered

**Keep `github:` and teach operators to fix git HTTPS.** Rejected because the marketplace button already chose the spec; a China-region host that serves `codeload.github.com` but stalls `git` against `github.com` is a product failure, not an operator git-config task.

**Widen `isInstallSpec` to arbitrary tarball URLs.** Rejected because that would let the Remote fetch any HTTPS body as the process user. The rewrite stays inside the already-validated `github:` allowlist.

**Stream pnpm stdio over a new Remote event.** Rejected for this change: the Host mutation is one `execFile` RPC, and a progress channel is a separate protocol project. The cover states the silence and the elapsed time instead.

## Consequences

A community Install still runs that repository's install/prepare scripts as user `dsh`. The profile dependency is recorded as the codeload tarball URL, not `github:owner/repo`. CLI `dsh plugin add github:…` outside the marketplace Host is unchanged and still uses git.

`DSH_NPM_REGISTRY` is a deploy overlay choice; the Host does not default the npm registry.

## Testing

Host tests cover `resolveInstallTarget` for registry names, `github:` HEAD, and `#ref`, plus community search dropping the official repository and cache envelope `3` rejecting version `2`. Client tests cover the busy hint, elapsed tick, and a catalog that stays visible after a successful install. Coverage gaps remain a live `dsh plugin add` of a GitHub archive on the published host, and CLI `github:` installs that still use git.
