# Agent Note: Web 设置中的插件市场

Status: implemented

[English](2026-08-14-web-plugin-marketplace.md) | 中文

## 问题

想装第三方或额外的官方插件的用户必须知道 `dsh plugin --profile <name> add <spec>`、知道哪些 GitHub 仓库为这个 harness 打了标签，并且重启进程。Settings 里已有**插件配置**和**插件列表**，但两者都不会发现当前 Loader 树之外的包，也不会修改 profile 层。

`deepseek-ai/deepseek-harness` 官方仓库是 harness 源码，不是 VS Code 式的插件市场。它的 `packages/` 树已由随附组合包组装；`dsh plugin add` 不能安装这些树内包。真正可安装的社区插件是独立的 GitHub 仓库，惯例上打 `dsh-plugin` 标签。

## 决策

Host Remote `@deepseek-ai/dsh-host-plugin-marketplace` 发布 `pluginMarketplace/catalog`、`pluginMarketplace/install` 和 `pluginMarketplace/remove`。Web“插件”分区由 `@deepseek-ai/dsh-client-ui-settings-plugin-marketplace` 贡献第三个 `settings.plugins.tab`（`id: marketplace`，`order: 5`）。

`catalog` 合并三个来源，并且不会因为 GitHub 失败而拒绝 RPC：

- **官方** — 配置仓库（默认 `deepseek-ai/deepseek-harness`）里 `packages/<group>/<pkg>/package.json` 的 GitHub git tree。这些行只供浏览（`installSpec: null`），因为它们已随 CLI 组合包交付。Config `officialSkipGroups` 默认跳过 `boot`、`examples`、`test-support`、`typert` 和 `util`。
- **社区** — GitHub 仓库搜索 `topic:<githubTopic>`（默认 `dsh-plugin`）。每条命中可安装为 `github:owner/repo`。
- **已安装** — `$DSH_HOME/profiles/<profile>/package.json` 中的依赖。这些行可以卸载。

`install` 与 `remove` 通过 `execFile` 启动 `dsh plugin --profile <name>`（不经过 shell）。规格只允许注册表名、可选版本/标签，以及 `github:owner/repo[#ref]`。相对路径、`file:`、`link:` 与 shell 元字符在启动前拒绝。成功的变更返回 `restartRequired: true`；正在运行的 Loader 不会热加载新装的 bundle。

所有随部署变化的选项都是 `Config` 字段，包括 `githubToken`（空字符串表示未认证请求）、`catalogCacheMs`、`installTimeoutMs` 和 `cliPath`。测试在 Gateway 构造函数上注入 `fetcher` 与 `run`；生产使用 `fetch` 和 `runNativeCommand`。

三条 Remote 以 `pluginMarketplace/catalog|install|remove` 加入 `PRIVILEGED_METHODS`（Typert 端点使用 `namespace/method`），因此局域网调用者不能列出 profile 依赖，也不能以 Host 进程用户身份安装包。把 `Host` 改写到回环的 nginx 仍可到达它们。

该标签页通过 [插件设置标签页](../architecture/2026-08-11-plugin-settings-tabs.md) 已有的 `settings.plugins.tab` slot 注册，不新增 Settings 导航行。

## 备选方案

**把官方 monorepo 当作可安装的 `dsh plugin add` 规格。** 否决，因为这些包已由 `dsh-base` / `dsh-web-app` 组装。再把它们加成 profile 依赖会重复树内模块，而且替换不了随附副本。

**单独一行名为“市场”的 Settings 导航。** 否决，因为发现、安装与当前 Loader 清单同属“插件”领域。标签 slot 已经存在，第三种视图无需修改分区拥有方即可加入。

**不重启就热加载新装的 bundle。** 本次否决：Loader 组合是进程启动时的事实，让 Host 在 `dsh plugin add` 之后挂载任意 profile 依赖是另一个运行时项目。界面会写明需要重启，而不是暗示新插件已经生效。

**让浏览器直接调用 GitHub 和 `dsh plugin`。** 否决，因为 GitHub token、profile 目录和以进程用户安装的权限属于 Host，并受回环钉扎保护。

**允许任意 `file:` / `link:` / 相对路径安装。** 否决，因为这些规格是本机代码执行通道；市场白名单是 Host 的拒绝，而不是 UI 便利。

## 影响

用户打开设置 → 插件 → **插件市场**，搜索或按官方 / 社区 / 已安装过滤，安装 `github:owner/repo` 或注册表规格，并卸载 profile 依赖。官方行只链接到 GitHub。变更成功后，加载该 profile 的 Host 进程必须重启，新层才会出现在**插件列表**中。

未配置 `githubToken` 时适用 GitHub 匿名 API 配额（每小时 60 次）；配额耗尽表现为失败的 `sources` 行，而不是空产品。目录快照缓存 `catalogCacheMs`（默认 10 分钟），并在成功的安装或卸载后清除。

安装社区包会在下次启动时以 `dsh` 进程用户运行任意代码。`/DSH/` 仍然无认证；回环钉扎是这些 Remote 唯一的网络围栏。

## 测试

包测试覆盖规格拒绝、目录合并与 GitHub 失败记录、`dsh plugin` 启动参数、缓存复用与失效、Settings 标签页的加载/失败/重试/过滤/安装/卸载路径，以及特权方法的回环钉扎。Web e2e 拦截 `pluginMarketplace/catalog` 并快照 `[data-marketplace-chrome]`，避免 GitHub 卡片列表把 golden 打成不稳定。覆盖缺口：超过第一页 100 条 topic 命中的 GitHub 分页，以及针对真实注册表的端到端 `dsh plugin add`（仍作为手工部署检查）。
