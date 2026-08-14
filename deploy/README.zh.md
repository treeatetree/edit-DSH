# 云主机 Web 叠加层

[English](README.md) | 中文

这是一层只改主机装配、不改 `packages/` 的叠加：官方 `dsh web` 仍绑定 `127.0.0.1`，由 nginx 按公网 Host 反代。`/api` location 把 `Host` 写成该回环权威名，特权 JSON-RPC（`settings.describe` 以及空信任列表里的其余方法）才能成功；`--trusted-host` 仍列出公网名，以覆盖仍携带该 Host 的请求（[绑定决策](../.agents/notes/implemented/feature/2026-07-22-web-bind-address.md)，[CLI](../apps/cli/reference/README.md)）。

## Layout

| 路径 | 职责 |
|---|---|
| `env.example` | `/opt/dsh/env` 的模板（Host、端口、npm 规格）。 |
| `nginx/dsh-web.conf` | nginx 虚拟主机：`:80` 上的公网 IP（及可选名字），外加一条专用发布端口。 |
| `systemd/dsh-web.service` | systemd 单元；`EnvironmentFile=/opt/dsh/env`。 |
| `bin/start-web.sh` | 启动官方 CLI，带 `--host 127.0.0.1` 与 `--trusted-host`。 |
| `install.sh` | 创建 `dsh` 用户，从 npm 安装 `@deepseek-ai/dsh`，启用 nginx 与 systemd。 |

## Install

在虚拟机上以 root 从本叠加层的检出执行：

```sh
sudo bash deploy/install.sh
```

`/opt/dsh/env` 一旦存在，`install.sh` 不会覆盖它。改 Host 后执行 `systemctl restart dsh-web`。再次运行 `install.sh` 会按模板覆盖 `/etc/nginx/conf.d/dsh-web.conf`。

随附默认值在 `:80` 上发布 `http://118.145.156.15/DSH/`（云安全组已经放行该端口）。`DSH_SERVER_NAME` 同时列出 `dsh.118.145.156.15.sslip.io`。把真实 DNS 指到该虚拟机后，把它加入 `DSH_SERVER_NAME` / `DSH_PUBLIC_HOST` / `DSH_EXTRA_HOSTS`，并重载 nginx 与 `dsh-web`。

## After boot

用浏览器打开 `http://118.145.156.15/DSH/`。在 **设置 → 模型** 粘贴 DeepSeek API key；叠加层不要求环境里有 `DEEPSEEK_API_KEY`。工作区选 `/opt/dsh/workspace`。`http://118.145.156.15/` 仍是流水首页；`/api` 仍是算账；`/finance` 与 `/hermes` 仍是那些应用。官方客户端仍请求站点根上的 `/api`、`/assets`、`/plugins`。`/DSH/` 的 HTML 会改写 `src="/assets/`、`href="/assets/`（样式表与 modulepreload）、插件 boot URL，以及站点根上的 manifest 与 favicon，并补丁 `fetch` / `WebSocket`。`/DSH/assets/` 下的 CSS 会改写 `url(/assets/`。同时注入 `crypto.randomUUID` polyfill，已发布 CLI 才能在非安全 HTTP 下运行。此 Host 上站点根 `/assets` 是流水 SPA 回退，所以未改写的样式表是 `200 text/html`，而不是 404。

TLS 隧道（cloudflared、Caddy）必须指向 nginx 发布端口（`DSH_PUBLISH_PORT`，默认 `13080`），不要指向 `DSH_BIND_PORT`。隧道直连 `127.0.0.1:3080` 会跳过 Host 改写，设置 → 模型会返回 HTTP 403。

本叠加层不提供登录。把 `/api` 的 Host 改写成回环，等于让特权方法在已发布主机名上可用。能访问该 Host 的人就可以驱动智能体，包括以进程用户 `dsh` 运行的 shell 与文件系统工具。在把它当成共享产品之前，不要把该 Host 暴露在公网，或在前面加身份感知代理。

## Known Limitations and Deferred Work

- **官方 CLI 仍拒绝 `--host 0.0.0.0`。** 对外发布靠 nginx（或其他反代），不改循环。
- **本机 80 端口已有其他应用。** 叠加层为公网 IP（及可选名字）增加 `server_name` 虚拟主机，不替换 default_server。未匹配的 Host 仍到流水。在 IP Host 上，DSH 只在 `/DSH/`；`/` 与 `/api` 仍是流水/算账。专用发布端口给内网或安全组放行后使用。
- **这里不终止 TLS。** 需要 HTTPS 时在 nginx 或隧道上挂证书，并把该 Host（443 时不要带端口）写入 `DSH_PUBLIC_HOST` / `DSH_EXTRA_HOSTS`。
