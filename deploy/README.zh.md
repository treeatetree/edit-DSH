# 云主机 Web 叠加层

[English](README.md) | 中文

这是一层只改主机装配、不改 `packages/` 的叠加：官方 `dsh web` 仍绑定 `127.0.0.1`，由 nginx 按公网 Host 反代，并用 `--trusted-host` 把该 Host 写入 `/api` 浏览器信任围栏（[绑定决策](../.agents/notes/implemented/feature/2026-07-22-web-bind-address.md)，[CLI](../apps/cli/reference/README.md)）。

## Layout

| 路径 | 职责 |
|---|---|
| `env.example` | `/opt/dsh/env` 的模板（Host、端口、npm 规格）。 |
| `nginx/dsh-web.conf` | nginx 虚拟主机：按名字匹配的 `:80`，外加一条专用发布端口。 |
| `systemd/dsh-web.service` | systemd 单元；`EnvironmentFile=/opt/dsh/env`。 |
| `bin/start-web.sh` | 启动官方 CLI，带 `--host 127.0.0.1` 与 `--trusted-host`。 |
| `install.sh` | 创建 `dsh` 用户，从 npm 安装 `@deepseek-ai/dsh`，启用 nginx 与 systemd。 |

## Install

在虚拟机上以 root 从本叠加层的检出执行：

```sh
sudo bash deploy/install.sh
```

`/opt/dsh/env` 一旦存在，`install.sh` 不会覆盖它。改 Host 后执行 `systemctl restart dsh-web`；若 nginx 模板变了，先移走 `/etc/nginx/conf.d/dsh-web.conf` 再重跑 `install.sh`。

随附默认值假定公网 IP 为 `118.145.156.15`、发布端口 `13080`，以及 `dsh.118.145.156.15.sslip.io`（sslip.io 用同一 A 记录应答该名）。把真实 DNS 指到该虚拟机后，把 `DSH_SERVER_NAME` / `DSH_PUBLIC_HOST` 改成该名，并重载 nginx 与 `dsh-web`。

## After boot

用浏览器打开那个具名 Host。在 **设置 → 模型** 粘贴 DeepSeek API key；叠加层不要求环境里有 `DEEPSEEK_API_KEY`。工作区选 `/opt/dsh/workspace`。

本叠加层不提供登录。能访问该 Host 的人就可以驱动智能体，包括以进程用户 `dsh` 运行的 shell 与文件系统工具。在把它当成共享产品之前，不要把该 Host 暴露在公网，或在前面加身份感知代理。

## Known Limitations and Deferred Work

- **官方 CLI 仍拒绝 `--host 0.0.0.0`。** 对外发布靠 nginx（或其他反代），不改循环。
- **本机 80 端口已有其他应用。** 叠加层增加 `server_name` 虚拟主机和一条专用发布端口，不占用 default_server 的 `/` 或 `/api`。
- **这里不终止 TLS。** 需要 HTTPS 时在 nginx 或隧道上挂证书，并把该 Host（443 时不要带端口）写入 `DSH_PUBLIC_HOST` / `DSH_EXTRA_HOSTS`。
