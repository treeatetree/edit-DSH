#!/usr/bin/env bash
# Install the official npm CLI plus nginx/systemd overlay. Does not patch packages/.
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
prefix="${DSH_PREFIX:-/opt/dsh}"
publish_port="${DSH_PUBLISH_PORT:-13080}"
bind_port="${DSH_BIND_PORT:-3080}"
npm_spec="${DSH_NPM_SPEC:-@deepseek-ai/dsh@0.1.0-rc.6}"
server_name="${DSH_SERVER_NAME:-dsh.118.145.156.15.sslip.io}"
public_host="${DSH_PUBLIC_HOST:-dsh.118.145.156.15.sslip.io}"
extra_hosts="${DSH_EXTRA_HOSTS:-118.145.156.15:13080}"

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
DSH_SERVER_NAME=$server_name
DSH_PUBLIC_HOST=$public_host
DSH_EXTRA_HOSTS=$extra_hosts
DSH_BIND_PORT=$bind_port
DSH_PUBLISH_PORT=$publish_port
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

install_nginx() {
  local dest=/etc/nginx/conf.d/dsh-web.conf
  sed -e "s/__DSH_PUBLISH_PORT__/$publish_port/g" \
      -e "s/__DSH_BIND_PORT__/$bind_port/g" \
      -e "s/__DSH_SERVER_NAME__/$server_name/g" \
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
install_nginx
install_unit
systemctl --no-pager --full status dsh-web.service || true
echo "install.sh: overlay is up. Open http://$server_name (also http://$extra_hosts)."
