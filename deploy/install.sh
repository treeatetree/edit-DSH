#!/usr/bin/env bash
# Install the official npm CLI plus nginx/systemd overlay. Does not patch packages/.
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
prefix="${DSH_PREFIX:-/opt/dsh}"
publish_port="${DSH_PUBLISH_PORT:-13080}"
bind_port="${DSH_BIND_PORT:-3080}"
npm_spec="${DSH_NPM_SPEC:-@deepseek-ai/dsh@0.1.0-rc.6}"
server_name="${DSH_SERVER_NAME:-dsh.118.145.156.15.sslip.io 118.145.156.15}"
public_host="${DSH_PUBLIC_HOST:-118.145.156.15}"
extra_hosts="${DSH_EXTRA_HOSTS:-dsh.118.145.156.15.sslip.io,118.145.156.15:13080}"
http_path="${DSH_HTTP_PATH:-DSH}"

need_root() {
  if [[ $(id -u) -ne 0 ]]; then
    echo "install.sh: run as root" >&2
    exit 1
  fi
}

ensure_user() {
  if ! id -u dsh >/dev/null 2>&1; then
    useradd --system --home "$prefix" --shell /usr/sbin/nologin dsh
  fi
  mkdir -p "$prefix"/{app,bin,home,workspace,log}
  cp -a "$root/bin/start-web.sh" "$prefix/bin/start-web.sh"
  chmod 0755 "$prefix/bin/start-web.sh"
  chown -R dsh:dsh "$prefix"
}

write_env() {
  local env_file="$prefix/env"
  if [[ -f $env_file ]]; then
    echo "install.sh: keeping existing $env_file"
    return
  fi
  umask 077
  cat >"$env_file" <<EOF
DSH_SERVER_NAME="$server_name"
DSH_PUBLIC_HOST=$public_host
DSH_EXTRA_HOSTS=$extra_hosts
DSH_BIND_PORT=$bind_port
DSH_PUBLISH_PORT=$publish_port
DSH_HTTP_PATH=$http_path
DSH_NPM_SPEC=$npm_spec
DSH_CLI=$prefix/app/node_modules/.bin/dsh
DSH_TELEMETRY_DISABLED=1
EOF
  chown dsh:dsh "$env_file"
  chmod 0600 "$env_file"
}

install_cli() {
  if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
    echo "install.sh: node and npm are required (Node ^22.19 || >=24)" >&2
    exit 1
  fi
  su -s /bin/bash dsh -c "cd '$prefix/app' && npm init -y >/dev/null && npm install --omit=dev '$npm_spec'"
  local cli="$prefix/app/node_modules/.bin/dsh"
  if [[ ! -x $cli ]]; then
    echo "install.sh: npm install did not produce $cli" >&2
    exit 1
  fi
}

ensure_pnpm() {
  if ! command -v pnpm >/dev/null; then
    if ! command -v corepack >/dev/null; then
      echo "install.sh: pnpm or corepack is required on PATH for plugin marketplace installs" >&2
      exit 1
    fi
    corepack enable
    corepack prepare pnpm@11.7.0 --activate
  fi
  local pnpm_path
  pnpm_path="$(command -v pnpm)"
  if [[ -z $pnpm_path ]]; then
    echo "install.sh: pnpm is still missing after corepack enable" >&2
    exit 1
  fi
  if [[ $pnpm_path != /usr/local/bin/pnpm && $pnpm_path != /usr/bin/pnpm ]]; then
    ln -sf "$pnpm_path" /usr/local/bin/pnpm
  fi
}

install_nginx() {
  if [[ ! $http_path =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "install.sh: DSH_HTTP_PATH must be one path segment (letters, digits, _ or -)" >&2
    exit 1
  fi
  local dest=/etc/nginx/conf.d/dsh-web.conf
  sed -e "s/__DSH_PUBLISH_PORT__/$publish_port/g" \
      -e "s/__DSH_BIND_PORT__/$bind_port/g" \
      -e "s/__DSH_SERVER_NAME__/$server_name/g" \
      -e "s/__DSH_HTTP_PATH__/$http_path/g" \
      "$root/nginx/dsh-web.conf" >"$dest"
  /usr/sbin/nginx -t
  # Prefer a direct HUP of the distro master: systemd reload can fail on
  # PrivateTmp namespace setup, and `nginx -s reload` may signal a different
  # master when Kong/OpenResty also run on the host.
  if ! systemctl reload nginx; then
    echo "install.sh: systemctl reload nginx failed; sending HUP to /run/nginx.pid" >&2
    if [[ -f /run/nginx.pid ]]; then
      kill -HUP "$(cat /run/nginx.pid)"
    else
      /usr/sbin/nginx -s reload
    fi
  fi
}

install_unit() {
  cp "$root/systemd/dsh-web.service" /etc/systemd/system/dsh-web.service
  systemctl daemon-reload
  systemctl enable --now dsh-web.service
}

need_root
ensure_user
write_env
install_cli
ensure_pnpm
install_nginx
install_unit
systemctl --no-pager --full status dsh-web.service || true
echo "install.sh: overlay is up. Open http://$public_host/$http_path/"
