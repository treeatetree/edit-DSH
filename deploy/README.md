# Cloud Web overlay

English | [中文](README.zh.md)

A host overlay that publishes official `dsh web` on a cloud VM without changing `packages/`. The CLI still binds `127.0.0.1`; nginx reverse-proxies a public Host. The `/api` location sets `Host` to that loopback authority so privileged JSON-RPC (`settings.describe` and the rest of the empty-trust list) can succeed; `--trusted-host` still lists the public name for any request that keeps it ([web bind](../.agents/notes/implemented/feature/2026-07-22-web-bind-address.md), [CLI](../apps/cli/reference/README.md)).

## Layout

| Path | Role |
|---|---|
| `env.example` | Template for `/opt/dsh/env` (Host names, ports, npm spec). |
| `nginx/dsh-web.conf` | nginx vhost: `:80` for the public IP (and optional names), plus a dedicated publish port. |
| `systemd/dsh-web.service` | systemd unit; `EnvironmentFile=/opt/dsh/env`. |
| `bin/start-web.sh` | Runs the official CLI with `--host 127.0.0.1` and `--trusted-host`. |
| `install.sh` | Creates `dsh`, installs `@deepseek-ai/dsh` from npm, enables nginx and systemd. |

## Install

On the VM, as root, from a checkout of this overlay:

```sh
sudo bash deploy/install.sh
```

`install.sh` does not replace `/opt/dsh/env` once that file exists. Edit Host names there, then `systemctl restart dsh-web`. Re-running `install.sh` overwrites `/etc/nginx/conf.d/dsh-web.conf` from the template.

The shipped defaults publish `http://118.145.156.15/` on `:80` (the port the cloud security group already forwards). `DSH_SERVER_NAME` also lists `dsh.118.145.156.15.sslip.io`. Point a real DNS name at the VM, add it to `DSH_SERVER_NAME` / `DSH_PUBLIC_HOST` / `DSH_EXTRA_HOSTS`, and reload nginx plus `dsh-web`.

## After boot

Open `http://118.145.156.15/` in a browser. In **Settings → Models**, paste a DeepSeek API key; the overlay does not require `DEEPSEEK_API_KEY` in the environment. Choose `/opt/dsh/workspace` as the workspace. `/finance` and `/hermes` on that IP still proxy to the host's existing apps. The liushui homepage at `/` on this IP Host is DSH, because the Web client needs origin-root `/` and `/api`.

Point TLS tunnels (cloudflared, Caddy) at the nginx publish port (`DSH_PUBLISH_PORT`, default `13080`), not at `DSH_BIND_PORT`. A tunnel aimed at `127.0.0.1:3080` skips the Host rewrite, and Settings → Models returns HTTP 403.

This overlay does not add authentication. Rewriting `/api` Host to loopback makes privileged methods reachable on the published hostname. Anyone who can reach that Host can drive the agent, including shell and filesystem tools under the process user `dsh`. Keep the Host off the public internet, or put an identity-aware proxy in front, before treating it as a shared product.

## Known Limitations and Deferred Work

- **Official CLI still rejects `--host 0.0.0.0`.** Publication is nginx (or another reverse proxy), not a loop change.
- **Port 80 on this host already serves other apps.** The overlay adds a `server_name` vhost for the public IP (and optional names) instead of replacing the default_server. Unmatched Hosts still reach liushui. On the IP Host, `/` and `/api` are DSH; `/finance` and `/hermes` stay the existing apps. The dedicated publish port is for LAN or a security-group opening.
- **TLS is not terminated here.** Put certificates on nginx or a tunnel when the Host must be HTTPS; add that Host (without a port when it is 443) to `DSH_PUBLIC_HOST` / `DSH_EXTRA_HOSTS`.
