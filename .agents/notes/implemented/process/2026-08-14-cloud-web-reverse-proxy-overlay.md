# Agent Note: Cloud Web reverse-proxy overlay over the official CLI

Status: implemented

English | [中文](2026-08-14-cloud-web-reverse-proxy-overlay.zh.md)

## Problem

A fork wants a browser UI reachable from the public internet while leaving every official `packages/` tree unchanged. `dsh web` binds `127.0.0.1` and rejects `--host 0.0.0.0`, so a cloud VM cannot publish the CLI socket directly. The same VM already serves other apps on `:80`, including an `/api` location, so the overlay cannot take that default_server.

## Decision

[`deploy/`](../../../../deploy/README.md) is a host overlay: it installs the published `@deepseek-ai/dsh` CLI from npm, runs `dsh web --host 127.0.0.1`, and publishes it through nginx. A named `:80` `server_name` plus a dedicated publish port keep the existing default_server intact. `--trusted-host` lists every public Host the browser may send. The `/api` location sets `Host` to `127.0.0.1:<bind>` and omits `Origin`, because privileged methods (`settings.describe`, credentials, host pickers) call `isTrustedApiRequest` with an empty trust list and therefore accept only a loopback Host. TLS tunnels must target the nginx publish port so that rewrite applies. The process user is `dsh`; session data lives under `/opt/dsh/home`.

This overlay does not add authentication. Network reachability is the access control unless a later proxy adds identity. The Host rewrite makes the loopback-only privileged RPC reachable on the published hostname.

## Alternatives considered

**Patch the official CLI to bind `0.0.0.0`.** Rejected: the CLI refuses that bind so a loopback-only process is not exposed as remote code execution, and the fork asked not to change official packages.

**Patch official `PRIVILEGED_METHODS` so `--trusted-host` satisfies the empty-trust check.** Rejected: the fork asked not to change official packages, and that check is the product's loopback pin for settings and credentials.

**Replace the existing `:80` default_server.** Rejected: that vhost already owns `/`, `/api`, `/finance`, and `/hermes`.

**Path-prefix the UI under `/dsh/` on the default_server.** Rejected: the Web client treats `/api` as a site-root prefix, so a path prefix would need official client changes.

**Build the monorepo on the VM.** Rejected: the official npm CLI is the supported run path, and the VM disk cannot hold a full workspace build.

## Consequences

- Operators publish the UI by editing `/opt/dsh/env` and nginx, not by forking `dsh-web-app`.
- A real DNS name replaces the sslip.io default by changing `DSH_SERVER_NAME` and `DSH_PUBLIC_HOST`.
- Anyone who can complete HTTP to the published Host can drive tools as user `dsh` until an identity proxy is added.
