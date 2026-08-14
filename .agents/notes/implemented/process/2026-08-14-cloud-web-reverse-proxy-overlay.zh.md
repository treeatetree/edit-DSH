# Agent Note: 在官方 CLI 之上的云主机 Web 反代叠加层

Status: implemented

[English](2026-08-14-cloud-web-reverse-proxy-overlay.md) | 中文

## Problem

fork 需要从公网打开浏览器 UI，同时保持官方 `packages/` 树完全不动。`dsh web` 绑定 `127.0.0.1` 并拒绝 `--host 0.0.0.0`，所以云虚拟机不能直接对外发布 CLI 套接字。同一台机器的 `:80` 已经在跑其他应用，并且占用了 `/api`，叠加层不能抢这个 default_server。

## Decision

[`deploy/`](../../../../deploy/README.md) 是主机叠加层：从 npm 安装已发布的 `@deepseek-ai/dsh` CLI，运行 `dsh web --host 127.0.0.1`，再经 nginx 对外发布。`:80` 的 `server_name` 列出公网 IP（及可选名字），浏览器才能在云安全组已经放行的端口上打开 `http://IP/DSH/`；未匹配的 Host 仍到现有 default_server。IP 虚拟主机上 `/` 与 `/api` 仍是流水/算账，`/finance` 与 `/hermes` 转到那些已有应用。DSH 只挂在 `/DSH/`。官方客户端仍请求站点根上的 `/api`、`/assets`、`/plugins`；`/DSH/` 的 HTML 会改写这些 URL 并补丁 `fetch` 与 `WebSocket`，然后 `/DSH/api` 去掉前缀并把 `Host` 设为 `127.0.0.1:<bind>`，特权方法（`settings.describe`、凭据、主机选择器）才能通过空信任列表的 `isTrustedApiRequest`。HTML 同时注入 `crypto.randomUUID` polyfill，因为浏览器在非安全 HTTP 下不提供该 API。专用发布端口留给内网或之后在安全组放行。`--trusted-host` 列出浏览器可能发送的每一个公网 Host。TLS 隧道必须指向 nginx 发布端口，该改写才会生效。进程用户是 `dsh`；会话数据在 `/opt/dsh/home`。

本叠加层不提供认证。在后面加身份代理之前，能连上该 Host 即能访问。Host 改写让仅回环的特权 RPC 在已发布主机名上可达。

## Alternatives considered

**改官方 CLI 去绑定 `0.0.0.0`。** 不采用：CLI 拒绝该绑定，是为了避免把仅回环的进程暴露成远程代码执行，而且 fork 要求不改官方包。

**改官方 `PRIVILEGED_METHODS`，让 `--trusted-host` 也能通过空信任检查。** 不采用：fork 要求不改官方包，而且该检查是产品对设置与凭据的回环钉扎。

**给官方客户端加 URL 基路径。** 不采用（对本叠加层）：nginx 改写 `/DSH/` HTML 并补丁 `fetch` / `WebSocket`，从而不改官方包。

**替换现有 `:80` default_server。** 不采用：未匹配的 Host 仍须到达流水，IP 虚拟主机上的 `/finance` / `/hermes` 作为反代 location 保留，而不是整台 default_server 换掉。

**在虚拟机上构建整个 monorepo。** 不采用：官方 npm CLI 才是受支持的运行路径，而且该盘装不下完整工作区构建。

## Consequences

- 运维通过改 `/opt/dsh/env` 和 nginx 来发布 UI，而不是 fork `dsh-web-app`。
- 打开 `http://118.145.156.15/DSH/` 即为 DSH；`http://118.145.156.15/` 仍是流水。`/api` 仍是算账。
- 在 IP 之外增加真实 DNS 名时，改 `DSH_SERVER_NAME` 与 `DSH_PUBLIC_HOST`。
- 在加上身份代理之前，只要能对已发布 Host 完成 HTTP，就可以用 `dsh` 用户驱动工具。
