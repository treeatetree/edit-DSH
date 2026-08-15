# @deepseek-ai/dsh-host-plugin-marketplace

English | [中文](README.zh.md)

Host Remote that assembles a plugin catalog and mutates the running profile through `dsh plugin`. `PluginMarketplaceGateway` registers the `pluginMarketplace` service and publishes three generated direct Remotes: `pluginMarketplace/catalog`, `pluginMarketplace/add`, and `pluginMarketplace/uninstall`.

`catalog` fetches the official GitHub repository's `packages/<group>/<pkg>/package.json` tree (browse-only rows; those packages already ship inside the CLI) and the public GitHub topic search for installable community repositories, then merges the profile's `package.json` dependencies. GitHub failures are recorded on `sources` and do not reject the RPC. `add` and `uninstall` spawn `dsh plugin --profile <name>` with `execFile` (no shell). Specs are restricted to registry names, optional versions/tags, and `github:owner/repo[#ref]`; relative paths, `file:`, `link:`, and shell metacharacters are refused. `add` forwards a `github:` spec to pnpm as `https://codeload.github.com/owner/repo/tar.gz/<ref-or-HEAD>` so install does not wait on `git ls-remote`. Community search omits `officialRepository`. A successful mutation reports `restartRequired: true` because the new layer is picked up on the next Host process start.

Public payload types live under `./types`. Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`. The service is Remote-only and declares no same-process Cordis `Context` merge. Client packages consume it through the [`api-remotes`](../../api/remotes/README.md) assembly.

Every deployment-varying choice is a `Config` field: official repository, GitHub topic, API origin, ref, User-Agent, optional token, skipped official groups, included official groups (default `bundle`; empty means every group except skip), profile name, catalog cache duration, whether to persist the catalog under `$DSH_HOME/plugin-marketplace-catalog.json`, whether to prefetch the catalog at plugin load, install timeout, and CLI path. Community rows include the GitHub search description, stars, forks, language, topics, owner avatar, and Open Graph image URL. Official rows copy repository-level stars, language, and the owner avatar from one extra `/repos/{owner}/{repo}` read. `add` / `uninstall` map a missing Host `pnpm` to `missing-pnpm` and do not put the CLI argv in `command-failed` messages.

## Model Experience

None, as this Host marketplace Remote registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Install does not restart the Host** — the profile layer changes on disk; the running Loader tree is unchanged until the process starts again.
- **Official monorepo packages are not `dsh plugin add` targets** — they are already composed by the shipped bundles; the official tree is a browse catalog with GitHub URLs.
- **Unauthenticated GitHub API quota applies** unless `githubToken` is set; exhausted quota appears as a failed `sources` row, not an empty product.
