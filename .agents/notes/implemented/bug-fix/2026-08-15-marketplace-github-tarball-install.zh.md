# Agent Note: 市场通过 GitHub 归档安装

Status: implemented

[English](2026-08-15-marketplace-github-tarball-install.md) | 中文

## 问题

市场封面的安装按钮会执行 `dsh plugin add github:owner/repo`，而 pnpm 用 `git ls-remote` / clone 解析该规格。在已发布的 `/DSH/` 主机上，`git ls-remote https://github.com/…` 会一直挂到 Host `installTimeoutMs`（默认五分钟），而 `https://codeload.github.com/owner/repo/tar.gz/HEAD` 不到一秒就能返回。封面只显示**正在安装…**，结束前不捕获 pnpm 的 stdio，成功后又把目录换成加载行，因此卡住的 git 拉取和工作中的安装看起来一样。社区 topic 搜索还会把 `officialRepository`（`deepseek-ai/deepseek-harness`）列成可安装的 `github:` 行；加上该规格会克隆整棵 harness。

目录所有权仍在 [Web 插件市场](../feature/2026-08-14-web-plugin-marketplace.md)。线上 PATH / SSE 映射仍在 [插件市场线上目录缺陷](2026-08-14-marketplace-live-catalog-bugs.md)。

## 决策

`resolveInstallTarget` 在调用 `dsh plugin add` 之前，把已接受的 `github:owner/repo[#ref]` 改写成 `https://codeload.github.com/owner/repo/tar.gz/<ref 或 HEAD>`。Remote 仍然只接受 `github:` 形式；任意 `https://` 规格继续拒绝。`parseCommunitySearch` 会丢掉 `full_name` 与 `officialRepository` 大小写不敏感相等的命中。磁盘缓存信封版本为 `3`。

封面在变更进行中保持最近一次目录，显示已用 `m:ss` 以及“不会流式显示 pnpm 输出”的本地提示，成功后不把正文切到加载行。叠加层 `install.sh` 在有 npm 时用 `npm install -g` 安装真正的 `pnpm@11.7.0`，并在设置了 `DSH_NPM_REGISTRY` 时写入 profile `.npmrc` 的 `registry=` 行。

## 备选方案

**继续使用 `github:`，让运维去修 git HTTPS。** 否决，因为市场按钮已经选定了规格；一台能访问 `codeload.github.com` 但对 `github.com` 的 git 会卡住的中国区主机是产品失败，不是运维的 git 配置任务。

**把 `isInstallSpec` 放宽到任意 tarball URL。** 否决，因为那会让 Remote 以进程用户身份拉取任意 HTTPS 正文。改写留在已经校验过的 `github:` 允许列表内。

**通过新的 Remote 事件流式传输 pnpm stdio。** 此次变更否决：Host 变更是一次 `execFile` RPC，进度通道是单独的协议项目。封面改为说明这段静默，并显示已用时间。

## 影响

社区安装仍会以 `dsh` 用户运行该仓库的 install/prepare 脚本。profile 依赖记录的是 codeload 归档 URL，而不是 `github:owner/repo`。市场 Host 之外的 CLI `dsh plugin add github:…` 不变，仍然走 git。

`DSH_NPM_REGISTRY` 是部署叠加层选项；Host 不会默认改 npm 注册表。

## 测试

Host 测试覆盖注册表名、`github:` HEAD 与 `#ref` 的 `resolveInstallTarget`，以及社区搜索丢掉官方仓库、缓存信封 `3` 拒绝版本 `2`。Client 测试覆盖忙碌提示、耗时跳动，以及成功安装后目录保持可见。覆盖缺口仍是在已发布主机上对 GitHub 归档做一次真实 `dsh plugin add`，以及仍然走 git 的 CLI `github:` 安装。
