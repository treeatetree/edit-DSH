#!/usr/bin/env bash
# Copy built marketplace packages into the official npm CLI tree and insert
# the two cordis.yml rows. Does not clone or build the monorepo on the VM.
set -euo pipefail

prefix="${DSH_PREFIX:-/opt/dsh}"
src="${1:-}"
cli="${DSH_CLI:-$prefix/app/node_modules/.bin/dsh}"
nm="$prefix/app/node_modules/@deepseek-ai"
profile_nm="$prefix/home/profiles/web/node_modules/@deepseek-ai"

need_root() {
  if [[ $(id -u) -ne 0 ]]; then
    echo "marketplace/install.sh: run as root" >&2
    exit 1
  fi
}

usage() {
  echo "usage: marketplace/install.sh <dir-with-package-folders>" >&2
  echo "  expected folders: dsh-host-plugin-marketplace dsh-client-ui-settings-plugin-marketplace dsh-api-remotes dsh-client-connection dsh-client-ui-layout dsh-client-ui-sidebar dsh-client-ui-settings-models dsh-client-ui-conversation" >&2
  exit 1
}

copy_package() {
  local dest_root="$1"
  local name="$2"
  local from="$src/$name"
  local to="$dest_root/$name"
  if [[ ! -f $from/package.json || ! -d $from/lib ]]; then
    echo "marketplace/install.sh: missing built package $from (need package.json and lib/)" >&2
    exit 1
  fi
  mkdir -p "$to"
  rm -rf "$to/lib"
  cp -a "$from/package.json" "$to/package.json"
  cp -a "$from/lib" "$to/lib"
}

patch_web_app_yml() {
  python3 - "$nm/dsh-web-app/cordis.patch.yml" "$cli" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
cli = sys.argv[2]
text = path.read_text()
host_row = (
    "    - id: plugin-marketplace\n"
    "      name: '@deepseek-ai/dsh-host-plugin-marketplace'\n"
    "      config:\n"
    f"        cliPath: {cli}\n"
    "        profile: web\n"
)
client_row = (
    "    - id: ui-settings-plugin-marketplace\n"
    "      name: '@deepseek-ai/dsh-client-ui-settings-plugin-marketplace'\n"
)
if "id: plugin-marketplace" not in text:
    needle = "      name: '@deepseek-ai/dsh-host-plugin-inventory'\n"
    if needle not in text:
        raise SystemExit("marketplace/install.sh: plugin-inventory row missing from cordis.patch.yml")
    text = text.replace(needle, needle + "\n" + host_row, 1)
if "id: ui-settings-plugin-marketplace" not in text:
    needle = "      name: '@deepseek-ai/dsh-client-ui-settings-plugin-inventory'\n"
    if needle not in text:
        raise SystemExit("marketplace/install.sh: plugin-inventory UI row missing from cordis.patch.yml")
    text = text.replace(needle, needle + "\n" + client_row, 1)
path.write_text(text)
PY
}

ensure_pnpm() {
  # Prefer a real pnpm entry over the corepack download shim. The first
  # `dsh plugin add` as user dsh otherwise fetches pnpm from registry.npmjs.org.
  if command -v npm >/dev/null; then
    # corepack leaves a pnpm shim in /usr/local/bin that npm install -g will not replace.
    rm -f /usr/local/bin/pnpm /usr/local/bin/pnpx
    if [[ -n ${DSH_NPM_REGISTRY:-} ]]; then
      npm install -g pnpm@11.7.0 --registry="$DSH_NPM_REGISTRY"
    else
      npm install -g pnpm@11.7.0
    fi
  elif ! command -v pnpm >/dev/null; then
    if ! command -v corepack >/dev/null; then
      echo "marketplace/install.sh: npm, pnpm, or corepack is required on PATH" >&2
      exit 1
    fi
    corepack enable
    corepack prepare pnpm@11.7.0 --activate
  fi
  local pnpm_path
  pnpm_path="$(command -v pnpm)"
  if [[ -z $pnpm_path ]]; then
    echo "marketplace/install.sh: pnpm is still missing after install" >&2
    exit 1
  fi
  if [[ $pnpm_path != /usr/local/bin/pnpm && $pnpm_path != /usr/bin/pnpm ]]; then
    ln -sf "$pnpm_path" /usr/local/bin/pnpm
  fi
}

ensure_profile_npmrc() {
  local registry="${DSH_NPM_REGISTRY:-}"
  local npmrc="$prefix/home/profiles/web/.npmrc"
  if [[ -z $registry ]]; then
    return
  fi
  printf 'registry=%s\n' "$registry" >"$npmrc"
  chown dsh:dsh "$npmrc"
}

reload_nginx() {
  /usr/sbin/nginx -t
  if ! systemctl reload nginx; then
    echo "marketplace/install.sh: systemctl reload nginx failed; sending HUP to /run/nginx.pid" >&2
    if [[ -f /run/nginx.pid ]]; then
      kill -HUP "$(cat /run/nginx.pid)"
    else
      /usr/sbin/nginx -s reload
    fi
  fi
}

refresh_host_overlay() {
  local deploy_root
  deploy_root="$(cd "$(dirname "$0")/.." && pwd)"
  if [[ -f $prefix/env ]]; then
    # shellcheck disable=SC1091
    set -a
    source "$prefix/env"
    set +a
  fi
  local publish_port="${DSH_PUBLISH_PORT:-13080}"
  local bind_port="${DSH_BIND_PORT:-3080}"
  local server_name="${DSH_SERVER_NAME:-dsh.118.145.156.15.sslip.io 118.145.156.15}"
  local http_path="${DSH_HTTP_PATH:-DSH}"
  if [[ -f $deploy_root/nginx/dsh-web.conf ]]; then
    if [[ ! $http_path =~ ^[A-Za-z0-9_-]+$ ]]; then
      echo "marketplace/install.sh: DSH_HTTP_PATH must be one path segment" >&2
      exit 1
    fi
    sed -e "s/__DSH_PUBLISH_PORT__/$publish_port/g" \
        -e "s/__DSH_BIND_PORT__/$bind_port/g" \
        -e "s/__DSH_SERVER_NAME__/$server_name/g" \
        -e "s/__DSH_HTTP_PATH__/$http_path/g" \
        "$deploy_root/nginx/dsh-web.conf" >/etc/nginx/conf.d/dsh-web.conf
    reload_nginx
  fi
  if [[ -f $deploy_root/systemd/dsh-web.service ]]; then
    cp "$deploy_root/systemd/dsh-web.service" /etc/systemd/system/dsh-web.service
    systemctl daemon-reload
  fi
}

clear_catalog_cache() {
  rm -f "$prefix/home/plugin-marketplace-catalog.json"
}

need_root
[[ -n $src && -d $src ]] || usage
[[ -x $cli ]] || { echo "marketplace/install.sh: missing CLI $cli" >&2; exit 1; }
[[ -d $nm/dsh-web-app ]] || { echo "marketplace/install.sh: missing $nm/dsh-web-app" >&2; exit 1; }

ensure_pnpm
ensure_profile_npmrc
refresh_host_overlay
clear_catalog_cache

copy_package "$nm" dsh-host-plugin-marketplace
copy_package "$nm" dsh-client-ui-settings-plugin-marketplace
copy_package "$nm" dsh-client-ui-layout
copy_package "$nm" dsh-client-ui-sidebar
copy_package "$nm" dsh-client-ui-settings-models
copy_package "$nm" dsh-client-ui-conversation
copy_package "$nm" dsh-api-remotes
copy_package "$nm" dsh-client-connection
# Loader imports extra profile rows with parent URL $DSH_HOME/profiles/web/,
# so Node never walks into the CLI tree for those two new package names.
copy_package "$profile_nm" dsh-host-plugin-marketplace
copy_package "$profile_nm" dsh-client-ui-settings-plugin-marketplace
patch_web_app_yml
chown -R dsh:dsh "$nm/dsh-host-plugin-marketplace" \
  "$nm/dsh-client-ui-settings-plugin-marketplace" \
  "$nm/dsh-client-ui-layout" \
  "$nm/dsh-client-ui-sidebar" \
  "$nm/dsh-client-ui-settings-models" \
  "$nm/dsh-client-ui-conversation" \
  "$nm/dsh-api-remotes" \
  "$nm/dsh-client-connection" \
  "$nm/dsh-web-app/cordis.patch.yml" \
  "$prefix/home/profiles/web/node_modules"
systemctl restart dsh-web.service
echo "marketplace/install.sh: overlayed marketplace packages; restarted dsh-web"
