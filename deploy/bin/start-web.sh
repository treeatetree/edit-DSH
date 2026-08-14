#!/usr/bin/env bash
# Launch official `dsh web` on loopback with Host values the reverse proxy will present.
set -euo pipefail

bind_port="${DSH_BIND_PORT:-3080}"
cli="${DSH_CLI:-/opt/dsh/app/node_modules/.bin/dsh}"

if [[ ! -x $cli ]]; then
  echo "dsh-web: missing official CLI at $cli" >&2
  exit 1
fi

trusted=()
if [[ -n ${DSH_PUBLIC_HOST:-} ]]; then
  trusted+=(--trusted-host "$DSH_PUBLIC_HOST")
fi
IFS=',' read -r -a extra <<<"${DSH_EXTRA_HOSTS:-}"
for host in "${extra[@]}"; do
  host="${host// /}"
  [[ -n $host ]] && trusted+=(--trusted-host "$host")
done

if ((${#trusted[@]} == 0)); then
  echo "dsh-web: set DSH_PUBLIC_HOST or DSH_EXTRA_HOSTS so the /api Host fence accepts the public name" >&2
  exit 1
fi

exec "$cli" web --host 127.0.0.1 --port "$bind_port" "${trusted[@]}"
