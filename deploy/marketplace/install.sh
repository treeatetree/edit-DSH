#!/usr/bin/env bash
# Copy built marketplace packages into the official npm CLI tree and insert
# the two cordis.yml rows. Does not clone or build the monorepo on the VM.
set -euo pipefail

prefix="${DSH_PREFIX:-/opt/dsh}"
src="${1:-}"
cli="${DSH_CLI:-$prefix/app/node_modules/.bin/dsh}"
nm="$prefix/app/node_modules/@deepseek-ai"

need_root() {
  if [[ $(id -u) -ne 0 ]]; then
    echo "marketplace/install.sh: run as root" >&2
    exit 1
  fi
}

usage() {
  echo "usage: marketplace/install.sh <dir-with-package-folders>" >&2
  echo "  expected folders: dsh-host-plugin-marketplace dsh-client-ui-settings-plugin-marketplace dsh-api-remotes dsh-client-connection" >&2
  exit 1
}

copy_package() {
  local name="$1"
  local from="$src/$name"
  local to="$nm/$name"
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

need_root
[[ -n $src && -d $src ]] || usage
[[ -x $cli ]] || { echo "marketplace/install.sh: missing CLI $cli" >&2; exit 1; }
[[ -d $nm/dsh-web-app ]] || { echo "marketplace/install.sh: missing $nm/dsh-web-app" >&2; exit 1; }

copy_package dsh-host-plugin-marketplace
copy_package dsh-client-ui-settings-plugin-marketplace
copy_package dsh-api-remotes
copy_package dsh-client-connection
patch_web_app_yml
chown -R dsh:dsh "$nm/dsh-host-plugin-marketplace" \
  "$nm/dsh-client-ui-settings-plugin-marketplace" \
  "$nm/dsh-api-remotes" \
  "$nm/dsh-client-connection" \
  "$nm/dsh-web-app/cordis.patch.yml"
systemctl restart dsh-web.service
echo "marketplace/install.sh: overlayed marketplace packages; restarted dsh-web"
