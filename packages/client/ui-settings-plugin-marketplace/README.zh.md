# @deepseek-ai/dsh-client-ui-settings-plugin-marketplace

[English](README.md) | 中文

侧栏一级入口的 **插件市场**。浏览器插件在设置上方注册一个本地化的 `sidebar.footer.action` 触发器（`id: plugin-marketplace`，`order: -10`），以及铺满对话栏的 `center.cover` 面板。插件激活期间通过 [`api-remotes`](../../api/remotes/README.md) 预取 `ctx.remote.pluginMarketplace.catalog()`，并保留最近一次快照，因此再次打开封面时不必等待 GitHub。

封面列出 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 中的官方包（只浏览），以及 GitHub 上带 `dsh-plugin` topic 的仓库（安装 spec 为 `github:owner/repo`）。卡片展示 GitHub 所有者头像、在行能对应到仓库时的 Open Graph 图、描述、星标和语言。安装和卸载走 `pluginMarketplace.add` / `pluginMarketplace.uninstall`，主机侧执行 `dsh plugin --profile <name>`。文案以中文为准。加载、空结果、无匹配、来源失败与通用失败状态只属于已挂载的封面。两处注册都使用 `ctx.slots.inject()`，因此能跟随 slot 的延迟声明、重新声明、本地化变化与 teardown。

成功的变更会提示需要重启 Web 进程后才会加载新的 profile 层。Escape 与封面标题栏会关闭面板但保持挂载，因此搜索文本和最近一次目录在再次打开时仍然在。

## 模型体验

无，因为本包只在 Web 外壳中展示并修改 Host 拥有的 profile 目录，不注册任何模型接口。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **官方 monorepo 包不是安装目标** —— 它们已随组合后的 CLI 交付；封面只提供 GitHub 链接。
- **安装不会热加载** —— `dsh plugin` 写入 profile 层；正在运行的 Loader 树要到下一次 Host 进程启动才会变化。
- **目录行是 GitHub + profile 的当下快照** —— 封面不订阅 GitHub 或 profile 变化；重试会刷新 Host 缓存。
