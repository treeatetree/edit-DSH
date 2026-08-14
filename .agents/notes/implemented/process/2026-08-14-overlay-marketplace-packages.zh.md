# Agent Note: 把插件市场包叠加到官方 npm CLI 上

Status: implemented

[English](2026-08-14-overlay-marketplace-packages.md) | 中文

## Problem

云主机 Web 叠加层跑的是 npm 上已发布的 `@deepseek-ai/dsh`。侧栏 **插件市场** 入口只存在于 fork 包（`dsh-host-plugin-marketplace`、`dsh-client-ui-settings-plugin-marketplace`，以及 `dsh-api-remotes` 的挂载、`dsh-client-connection` 的特权方法列表、`dsh-client-ui-layout` 的 `center.cover` 席位，和 `dsh-client-ui-sidebar` 的页脚堆叠）。这些包不在 npm tarball 里，所以 `/DSH/` 看不到该入口。虚拟机磁盘也装不下完整 monorepo 构建。

## Decision

[`deploy/marketplace/install.sh`](../../../../deploy/marketplace/install.sh) 把已经构建好的包树复制进 `/opt/dsh/app/node_modules/@deepseek-ai/`，并往 `dsh-web-app` 的 `cordis.patch.yml` 插入两行。npm CLI 里不存在的那两个包还要放到 `$DSH_HOME/profiles/web/node_modules/@deepseek-ai/`，因为 Loader 导入额外行时的父 URL 是 `$DSH_HOME/profiles/web/`，Node ESM 不会从那里走进 CLI 树。Host 行把 `cliPath` 设成叠加层 CLI，把 `profile` 设成 `web`。脚本还会把 `pnpm@11.7.0` 放到 PATH 上（corepack，再加 `/usr/local/bin/pnpm`），在同级 `deploy/nginx/dsh-web.conf` 与 `deploy/systemd/dsh-web.service` 存在时复制它们，并删除 `$DSH_HOME/plugin-marketplace-catalog.json`，避免旧信封继续提供过时的 `officialGroups` 默认。systemd PATH 包含 `/usr/local/bin`，因此 `dsh plugin` 能启动 pnpm。运维在能放下工作区的机器上构建这些包，再从含有当前 nginx 与单元文件的检出把解压后的目录交给脚本；虚拟机不编译 TypeScript。

复制的树是 `dsh-host-plugin-marketplace`、`dsh-client-ui-settings-plugin-marketplace`、`dsh-api-remotes`、`dsh-client-connection`、`dsh-client-ui-layout`、`dsh-client-ui-sidebar`、`dsh-client-ui-settings-models` 和 `dsh-client-ui-conversation`。必须替换 remotes，因为浏览器侧 Remote 挂载在该 Client 组合里；替换 connection 是为了把 `pluginMarketplace/catalog|add|uninstall` 钉到与其他特权方法相同的回环 Host 改写上。替换 layout 是为了声明 `center.cover` 以及 compact／split chrome；替换 sidebar 是为了把页脚操作叠在设置上方并绘制 compact 底栏。替换 models 会去掉默认内测声明；替换 conversation 会把输入框抬到该底栏之上（[移动端与折叠屏 Web 外壳](../feature/2026-08-14-mobile-fold-shell.md)，[取消默认内测声明](../feature/2026-08-14-drop-default-welcome-notice.md)）。

## Alternatives considered

**在虚拟机上构建 monorepo 并跑 fork CLI。** 不采用：叠加层已经拒绝完整工作区构建，剩余磁盘也放不下。

**只用 `dsh plugin add` 安装一个 `file:` 市场组合包。** 不采用（作为唯一步骤）：profile 组合包可以插入那两行，但除非替换 `dsh-api-remotes`，Client 仍不会 `$mount` `pluginMarketplace`；而且市场 RPC 本身拒绝 `file:` / `link:` 规格。

**把 fork 包发布到 npm 并提高 `DSH_NPM_SPEC`。** 推迟：本叠加层必须在已经安装的 `0.1.0-rc.6` CLI 上工作，没有私有包仓库。

## Consequences

- 在 `http://118.145.156.15/DSH/` 打开侧栏 **插件市场** 时，用的是 fork 的 Host Remote 与对话栏封面。
- 再次运行 `deploy/install.sh` 会重装 npm CLI 并清掉复制的树；之后必须再跑一次 `marketplace/install.sh`。
- 安装社区插件后，仍会在下次进程启动时以 `dsh` 用户运行该包。

## Testing

市场 Host 与封面的包测试仍属于那些包。叠加层证据是重启后线上 `/DSH/` 的 boot JSON 列出 `plugin-marketplace` 与 `ui-settings-plugin-marketplace`，以及侧栏入口打开后的对话栏封面。`scripts/dsh-nginx-path-prefix.spec.ts` 覆盖 HTML 的 EventSource 补丁以及不缓冲的 `/plugins/events` location。
