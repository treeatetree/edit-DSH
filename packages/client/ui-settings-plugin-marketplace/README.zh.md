# @deepseek-ai/dsh-client-ui-settings-plugin-marketplace

[English](README.md) | 中文

Web 设置中的 **插件市场** 标签页。浏览器插件注册一个 id 为 `marketplace`、`order: 5` 的本地化 `settings.plugins.tab` 贡献；“插件”分区拥有导航入口与标签栏。插件激活期间不会读取 Remote；首次选择该标签页时才挂载组件，并通过 [`api-remotes`](../../api/remotes/README.md) 懒调用 `ctx.remote.pluginMarketplace.catalog()`。

该标签页列出 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 中的官方包（只浏览），以及 GitHub 上带 `dsh-plugin` topic 的仓库（安装 spec 为 `github:owner/repo`）。安装和卸载走 `pluginMarketplace.install` / `pluginMarketplace.remove`，主机侧执行 `dsh plugin --profile <name>`。文案以中文为准。加载、空结果、无匹配、来源失败与通用失败状态只属于已挂载组件。注册使用 `ctx.slots.inject()`，因此能跟随标签 slot 的延迟声明、重新声明、本地化变化与 teardown，而无需 import 分区拥有方。

成功的变更会提示需要重启 Web 进程后才会加载新的 profile 层。

## 模型体验

无，因为本包只在浏览器设置中展示并修改 Host 拥有的 profile 目录，不注册任何模型接口。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **官方 monorepo 包不是安装目标** —— 它们已随组合后的 CLI 交付；标签页只提供 GitHub 链接。
- **安装不会热加载** —— `dsh plugin` 写入 profile 层；正在运行的 Loader 树要到下一次 Host 进程启动才会变化。
- **目录行是 GitHub + profile 的当下快照** —— 标签页不订阅 GitHub 或 profile 变化；重试或重新打开 Settings 才会刷新。
