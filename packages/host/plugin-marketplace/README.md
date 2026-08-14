# @deepseek-ai/dsh-host-plugin-marketplace

English | [中文](README.zh.md)

Host Remote that assembles a plugin catalog and mutates the running profile through `dsh plugin`. `PluginMarketplaceGateway` registers the `pluginMarketplace` service and publishes three generated direct Remotes: `pluginMarketplace/catalog`, `pluginMarketplace/install`, and `pluginMarketplace/remove`.

`catalog` fetches the official GitHub repository's `packages/<group>/<pkg>/package.json` tree (browse-only rows; those packages already ship inside the CLI) and the public GitHub topic search for installable community repositories, then merges the profile's `package.json` dependencies. GitHub failures are recorded on `sources` and do not reject the RPC. `install` and `remove` spawn `dsh plugin --profile <name>` with `execFile` (no shell). Specs are restricted to registry names, optional versions/tags, and `github:owner/repo[#ref]`; relative paths, `file:`, `link:`, and shell metacharacters are refused. A successful mutation reports `restartRequired: true` because the new layer is picked up on the next Host process start.

Public payload types live under `./types`. Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`. The service is Remote-only and declares no same-process Cordis `Context` merge. Client packages consume it through the [`api-remotes`](../../api/remotes/README.md) assembly.

Every deployment-varying choice is a `Config` field: official repository, GitHub topic, API origin, ref, User-Agent, optional token, skipped official groups, profile name, catalog cache duration, install timeout, and CLI path.

## Model Experience

None, as this Host marketplace Remote registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Install does not restart the Host** — the profile layer changes on disk; the running Loader tree is unchanged until the process starts again.
- **Official monorepo packages are not `dsh plugin add` targets** — they are already composed by the shipped bundles; the official tree is a browse catalog with GitHub URLs.
- **Unauthenticated GitHub API quota applies** unless `githubToken` is set; exhausted quota appears as a failed `sources` row, not an empty product.
