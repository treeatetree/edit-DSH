# Agent Note: 插件市场作为侧栏一级入口

Status: implemented

[English](2026-08-14-plugin-marketplace-primary-entry.md) | 中文

## 问题

插件市场原先是设置 → 插件里的第三个标签页。发现或安装社区插件需要打开设置、切换分区、再切换标签，目录还画在 800px 的设置面板里。GitHub 搜索 payload 里的头像、Open Graph 图、语言、fork 和 topic 被丢掉。Host 每次启动都重新请求 GitHub，所以打开标签页要等一次冷目录。

## 决策

`@deepseek-ai/dsh-client-ui-settings-plugin-marketplace` 在设置正上方注册 `sidebar.footer.action` 触发器（`id: plugin-marketplace`，`order: -10`），以及铺满对话栏的 `center.cover` 列表贡献。封关闭合时保持挂载（`display: none`），因此搜索文本和最近快照在再次打开时还在，并且不会截获指针事件。Escape 与封面标题栏调用共享查看状态 store 的 `close()`。

`ui-layout` 把 `center.cover` 声明为根级列表 slot，叠在中栏 `conversation` 占位方之上。贡献不得替换 `conversation`；封面是加法的。`shell.overlay` 仍是 toast 和 Cordis 清单所用的整框浮动层。

Host `catalog` 行现在带 `imageUrl`、`coverUrl`、`owner`、`language`、`updatedAt`、`forks` 和 `topics`。社区行从 GitHub 搜索 payload 映射这些字段，再加上 `https://opengraph.githubassets.com/1/{owner}/{repo}`（不再打 API）。官方行在已有 git-tree 读取之外，用一次 `GET /repos/{owner}/{repo}` 复制仓库级星标、语言和所有者头像；不用 monorepo 的 Open Graph 图当每个包的封面。tree、repo 与 topic 搜索并发执行。

`Config.persistCatalog`（默认 true）把目录写到 `$DSH_HOME/plugin-marketplace-catalog.json`，信封版本为 `1`。`Config.prefetchCatalog`（默认 true）在 Host 插件加载时启动 `catalog()`。测试注入 `persist`，并把这两个开关设为 false。成功的 add/uninstall 会清掉内存和磁盘。浏览器插件也会经 Remote 预取，并立刻画出 `lastCatalog`。

Host RPC 名称、规格拒绝、特权方法回环钉扎和 `restartRequired` 仍以 [Web 插件市场](2026-08-14-web-plugin-marketplace.md) 为准。

## 备选方案

**保留 Settings 标签页，再加一个打开该标签页的侧栏快捷方式。** 否决，因为设置面板用不了对话栏，而用户要求的是右侧整片区域都给市场用的一级入口。

**市场打开时占用 `conversation`（single）。** 否决，因为那会卸载 ConversationRoot 以及它声明的每个席位。

**把市场放进 `shell.overlay`。** 否决，因为那一层是可点击穿透的整框浮动层；需要整栏的产品面板属于中栏轨道。

**从 GitHub Contents 或 raw.githubusercontent.com 拉取每个官方 `package.json`。** 否决，因为几百次额外请求会让第一次目录比现有的 tree+search 更慢；仓库级元数据和搜索字段已经覆盖头像和社区描述。

**只做内存缓存。** 否决，因为 Host 重启（安装路径已经要求重启）会让下一次打开再次等待 GitHub。

## 影响

侧栏在设置上方显示 **插件市场**。打开后覆盖对话栏；设置 → 插件不再有市场标签页。目录卡片展示头像，社区/已安装的 GitHub 规格还展示 Open Graph 图。Host 重启后，磁盘缓存会服务到 `catalogCacheMs` 到期。

未认证 GitHub 配额仍然适用；额外的 `/repos` 读取是每次官方刷新一次，不是每个包一次。发布市场客户端的 overlay 部署也必须 overlay `ui-layout` 和 `ui-sidebar`，这样 `center.cover` 才存在，触发器才会叠在设置上方。

## 测试

包测试覆盖 GitHub 字段映射、并行仓库元数据、磁盘缓存复用/失效/损坏信封、预取、persist 保存/清除失败、侧栏触发器与封面的打开/关闭/Escape、last-catalog 绘制，以及图片 `onError` 隐藏。Web e2e 从导航开始就拦截 `pluginMarketplace/catalog`，并在点击侧栏触发器后快照 `[data-marketplace-chrome]`。覆盖缺口仍是超过第一页 100 条 topic 命中的 GitHub 分页，以及针对真实注册表的端到端 `dsh plugin add`。
