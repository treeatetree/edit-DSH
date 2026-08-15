# Agent Note: 插件市场线上目录与安装失败

Status: implemented

[English](2026-08-14-marketplace-live-catalog-bugs.md) | 中文

## 问题

已发布的 `/DSH/` 插件市场列出大约两百个官方 monorepo 包（`acp`、`gateway`、`ui-layout` 等），全部 `installSpec: null`。真正能装的只有 GitHub topic `dsh-plugin` 命中。随后 `dsh plugin add` 因 `pnpm not found on PATH` 失败，因为 `dsh-web.service` 的 PATH 没有 pnpm 垫片，Host 还把 `Command failed: /opt/dsh/app/node_modules/.bin/dsh plugin …` 回传到封面。提示条不能关闭，一次失败安装会在切换过滤后仍留在屏幕上。GitHub Open Graph 图把标题和描述又当 120px 头图重复一遍，紧凑宽度下 Install 还会叠到第一张卡上。已安装过滤为空时，自定义规格表单看起来像另一条目录结果。`/DSH/` 下的 HTML 补丁了 `fetch` 和 `WebSocket`，但没有补丁 `EventSource`，因此 `/plugins/events` 打到 IP 虚拟主机的流水 HTML；即便路径改对，`location ^~ /DSH/plugins/` 也会把 SSE 缓冲住。

目录所有权仍在 [Web 插件市场](../feature/2026-08-14-web-plugin-marketplace.md) 和 [插件市场一级入口](../feature/2026-08-14-plugin-marketplace-primary-entry.md)。叠加复制仍在 [叠加市场包](../process/2026-08-14-overlay-marketplace-packages.md)。

## 决策

`Config.officialGroups` 默认为 `['bundle']`。空数组表示除 `officialSkipGroups` 外的全部分组。磁盘缓存信封版本为 `3`，因此先前的整树或未过滤社区快照会未命中。

`runPluginCommand` 把 `/pnpm not found/i` 映射为 `missing-pnpm`，文案是 `pnpm is not installed on PATH`；其他启动失败映射为 `dsh plugin ${verb} failed`。叠加层 `install.sh` / `marketplace/install.sh` 在有 npm 时用 `npm install -g` 安装 `pnpm@11.7.0`，否则走 corepack，并在 systemd PATH 上放 `/usr/local/bin/pnpm` 垫片。`github:` 规格如何拉取记录在 [市场 GitHub 归档安装](2026-08-15-marketplace-github-tarball-install.md)。

封面可以关闭提示，给 `installSpec: null` 的官方行标“仅浏览”，给自定义规格表单可见标签，并且只在展开详情里渲染 Open Graph 图。

nginx HTML 注入的 `EventSource` 构造函数与 `fetch` / `WebSocket` 使用同一套站点根前缀改写。`location = /DSH/plugins/events` 反代时不缓冲、不 gzip；其余 `/DSH/plugins/` 响应仍缓冲以便 gzip。

## 备选方案

**把 `officialSkipGroups` 加宽到列表变短。** 否决，因为跳过列表会随新分组漂移，可安装的官方面是 profile 组合包层，而不是靠省略 `packages/` 来放行。

**在 systemd PATH 上写死 nvm 的 Node bin 目录。** 否决，因为 `dsh` 系统用户不拥有那棵树；root 在 `/usr/local/bin` 放的 corepack 垫片才是该单元已经搜索的 PATH。

**继续把 Open Graph 图当折叠卡片头图。** 否决，因为 GitHub 的图里已经有标题、描述和星标，卡片会自己重复自己。

## 影响

官方过滤显示 `packages/bundle/*` 的浏览行（web-app、headless、base），而不是整棵 monorepo。社区安装要求 Host PATH 上有 pnpm。变更错误不再泄漏 CLI argv。`/DSH/` 下的 SSE 使用改写后的 EventSource URL 以及不缓冲的 location。

安装社区规格后，仍会在下次进程启动时以 `dsh` 用户运行该仓库。

## 测试

Host 测试覆盖 `officialGroups` 过滤、缓存信封 `3` 拒绝版本 `1` 和 `2`、`missing-pnpm`，以及净化后的 `command-failed`。Client 测试覆盖仅浏览文案、仅在展开后出现封面图、关闭提示，以及 `missing-pnpm` 本地诊断。`scripts/dsh-nginx-path-prefix.spec.ts` 断言 EventSource 注入和 `/plugins/events` 缓冲。覆盖缺口仍是线上 GitHub 分页，以及针对真实注册表的端到端 `dsh plugin add`。
