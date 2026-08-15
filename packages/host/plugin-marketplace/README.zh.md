# @deepseek-ai/dsh-host-plugin-marketplace

[English](README.md) | 中文

组装插件目录并通过 `dsh plugin` 修改当前 profile 的 Host Remote。`PluginMarketplaceGateway` 注册 `pluginMarketplace` 服务，并发布三条生成的直接 Remote：`pluginMarketplace/catalog`、`pluginMarketplace/add`、`pluginMarketplace/uninstall`。

`catalog` 读取官方 GitHub 仓库中 `packages/<group>/<pkg>/package.json` 的树（只供浏览；这些包已随 CLI 交付），以及公开 GitHub topic 搜索得到的可安装社区仓库，再与 profile 的 `package.json` 依赖合并。GitHub 失败记录在 `sources` 上，不拒绝 RPC。`add` 与 `uninstall` 用 `execFile` 启动 `dsh plugin --profile <name>`（不经过 shell）。规格只允许注册表名、可选版本/标签，以及 `github:owner/repo[#ref]`；相对路径、`file:`、`link:` 与 shell 元字符一律拒绝。`add` 把 `github:` 规格转发给 pnpm 时改写成 `https://codeload.github.com/owner/repo/tar.gz/<ref 或 HEAD>`，安装不会卡在 `git ls-remote`。社区搜索会去掉 `officialRepository`。成功的变更会报告 `restartRequired: true`，因为新层要到下一次 Host 进程启动才会被拾取。

公开 payload 类型位于 `./types`。Typert 生成由 `./typert` 与 `./remote` 导出的 Host 和 Client Remote 产物。该服务仅供 Remote 使用，不声明同进程 Cordis `Context` merge。Client 包通过 [`api-remotes`](../../api/remotes/README.md) 组合消费它。

所有随部署变化的选项都是 `Config` 字段：官方仓库、GitHub topic、API 源、ref、User-Agent、可选 token、跳过的官方分组、保留的官方分组（默认 `bundle`；空数组表示除跳过分组外的全部组）、profile 名、目录缓存时长、是否把目录持久化到 `$DSH_HOME/plugin-marketplace-catalog.json`、是否在插件加载时预取目录、安装超时，以及 CLI 路径。社区行带上 GitHub 搜索里的描述、星标、fork、语言、topic、所有者头像和 Open Graph 图 URL。官方行通过一次额外的 `/repos/{owner}/{repo}` 读取复制仓库级星标、语言和所有者头像。`add` / `uninstall` 把主机缺少 `pnpm` 映射为 `missing-pnpm`，并且不把 CLI argv 放进 `command-failed` 文案。

## 模型体验

无，因为这个 Host 插件市场 Remote 不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **安装不会重启 Host** —— profile 层写在磁盘上；正在运行的 Loader 树要到进程再次启动才会变化。
- **官方 monorepo 包不是 `dsh plugin add` 目标** —— 它们已由随附组合包组装；官方树是带 GitHub URL 的浏览目录。
- **未配置 `githubToken` 时适用 GitHub 匿名 API 配额**；配额耗尽表现为失败的 `sources` 行，而不是空产品。
