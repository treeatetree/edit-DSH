# Agent Note: Cloud Web reverse-proxy overlay over the official CLI

Status: implemented

English | [中文](2026-08-14-cloud-web-reverse-proxy-overlay.zh.md)

## Problem

A fork wants a browser UI reachable from the public internet while leaving every official `packages/` tree unchanged. `dsh web` binds `127.0.0.1` and rejects `--host 0.0.0.0`, so a cloud VM cannot publish the CLI socket directly. The same VM already serves other apps on `:80`, including an `/api` location, so the overlay cannot take that default_server.

## Decision

[`deploy/`](../../../../deploy/README.md) is a host overlay: it installs the published `@deepseek-ai/dsh` CLI from npm, runs `dsh web --host 127.0.0.1`, and publishes it through nginx. A `:80` `server_name` lists the public IP (and optional names) so a browser can open `http://IP/DSH/` on the port the cloud security group already forwards; unmatched Hosts still hit the existing default_server. On the IP vhost, `/` and `/api` stay liushui/suanzhang, and `/finance` and `/hermes` proxy to those existing apps. DSH lives only under `/DSH/`. The official client still calls origin-root `/api`, `/assets`, and `/plugins`. The `/DSH/` HTML rewrite covers `src="/assets/` (the module script), `href="/assets/` (stylesheets and modulepreload), boot JSON `url` values under `/plugins/`, and the origin-root manifest and favicon; CSS under `/DSH/assets/` also rewrites `url(/assets/` so KaTeX fonts do not resolve to the IP vhost root. That root's `try_files` serves liushui `index.html` for unknown `/assets/*`, so an unrewritten stylesheet returns `200 text/html` and the UI renders without CSS. The injected fetch/WebSocket patch still matches origin-root `/api`, `/assets/`, and `/plugins/`; the HTML substitutions do not rewrite those needles inside the patch. `/DSH/api` then strips the prefix and sets `Host` to `127.0.0.1:<bind>` so privileged methods (`settings.describe`, credentials, host pickers) pass `isTrustedApiRequest` with an empty trust list. The HTML also injects a `crypto.randomUUID` polyfill because browsers omit that API on insecure HTTP. A dedicated publish port remains for LAN or a later security-group opening. `--trusted-host` lists every public Host the browser may send. TLS tunnels must target the nginx publish port so that rewrite applies. The process user is `dsh`; session data lives under `/opt/dsh/home`. systemd puts `/opt/dsh/app/node_modules/.bin` on `PATH` so overlay tools that spawn `dsh` resolve the same CLI.

`dsh web` does not gzip. Locations that run `sub_filter` clear `Accept-Encoding` so nginx sees uncompressed bodies. `/DSH/assets/` and `/DSH/plugins/` enable `proxy_buffering` so `gzip_proxied any` can compress hashed vendor JS and plugin `client.js`; hashed assets also get `expires 7d`. The HTML location stays unbuffered for WebSocket and SSE. The [marketplace overlay](2026-08-14-overlay-marketplace-packages.md) copies selected built fork packages into that npm tree when the Settings marketplace tab must appear.

This overlay does not add authentication. Network reachability is the access control unless a later proxy adds identity. The Host rewrite makes the loopback-only privileged RPC reachable on the published hostname.

## Alternatives considered

**Patch the official CLI to bind `0.0.0.0`.** Rejected: the CLI refuses that bind so a loopback-only process is not exposed as remote code execution, and the fork asked not to change official packages.

**Patch official `PRIVILEGED_METHODS` so `--trusted-host` satisfies the empty-trust check.** Rejected: the fork asked not to change official packages, and that check is the product's loopback pin for settings and credentials.

**Give the official client a URL base path.** Rejected for this overlay: nginx rewrites `/DSH/` HTML and patches `fetch` / `WebSocket` so packages stay unchanged.

**Map origin-root `/assets/` to DSH.** Rejected: the IP vhost root `/assets` belongs to liushui; stealing it would break that app.

**Rewrite every `"/assets/` substring in HTML.** Rejected: that would also rewrite the injected patch's `indexOf("/assets/")` needle, so a later fetch of origin-root `/assets/` would not be prefixed.

**Replace the existing `:80` default_server.** Rejected: unmatched Hosts must still reach liushui, and `/finance` / `/hermes` stay on the IP vhost as proxied locations rather than taking over the whole default_server.

**Build the monorepo on the VM.** Rejected: the official npm CLI is the supported run path, and the VM disk cannot hold a full workspace build. Selected fork packages that the npm tarball does not contain are copied in by the [marketplace overlay](2026-08-14-overlay-marketplace-packages.md) instead.

## Consequences

- Operators publish the UI by editing `/opt/dsh/env` and nginx, not by forking `dsh-web-app`.
- Opening `http://118.145.156.15/DSH/` serves DSH; `http://118.145.156.15/` stays liushui. `/api` stays suanzhang.
- A real DNS name is added beside the IP by changing `DSH_SERVER_NAME` and `DSH_PUBLIC_HOST`.
- Anyone who can complete HTTP to the published Host can drive tools as user `dsh` until an identity proxy is added.

## Testing

`scripts/dsh-nginx-path-prefix.spec.ts` applies the `/DSH/` HTML and `/DSH/assets/` CSS `sub_filter` list to a Vite `index.html` fixture and a KaTeX `@font-face` rule. It requires stylesheet and modulepreload `href="/assets/` to become `/DSH/assets/`, requires `url(/assets/` in CSS to take the same prefix, and requires the injected fetch patch to keep `indexOf("/assets/")` as the origin-root needle. It also requires `gzip on` / `gzip_proxied any`, `proxy_buffering on` for `/DSH/assets/` and `/DSH/plugins/`, and `proxy_buffering off` on the HTML location.
