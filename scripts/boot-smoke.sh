#!/usr/bin/env bash
# Isolated rc.2 boot smoke: builds a scratch DSH_HOME, symlinks a real profile
# into it, boots dsh on a scratch port, and asserts the plugin's English roles
# catalog is served with the `oracle` role and no module-resolution errors in
# the boot log.
#
# This is the test that caught the enabled `opencode-omo-web-fetch` host row
# (missing @deepseek-ai/dsh-web-fetch-http on 0.1.1-rc.2): probing the main
# harness cannot see host packages that only exist there. Run it before every
# rc.2 release; CI adoption needs a bootable profile fixture first.
#
# Env:
#   DSH_BIN          path to the dsh bin shim (default: newest npx cache copy)
#   DSH_PROFILE_SRC  source profile dir to symlink (default: ~/.dsh/profiles/web)
#   BOOT_PORT        scratch port (default: 3199)
set -euo pipefail

PORT="${BOOT_PORT:-3199}"
WORK="$(mktemp -d /tmp/dsh-boot-smoke.XXXXXX)"
PID=""
cleanup() {
  if [[ -n "$PID" ]]; then kill "$PID" 2>/dev/null || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

DSH_BIN="${DSH_BIN:-}"
if [[ -z "$DSH_BIN" ]]; then
  for cand in "$HOME"/.npm/_npx/*/node_modules/.bin/dsh; do
    if [[ -x "$cand" ]]; then DSH_BIN="$cand"; break; fi
  done
fi
if [[ -z "$DSH_BIN" || ! -x "$DSH_BIN" ]]; then
  echo "dsh bin shim not found; set DSH_BIN" >&2
  exit 2
fi

PROFILE_SRC="${DSH_PROFILE_SRC:-$HOME/.dsh/profiles/web}"
if [[ ! -d "$PROFILE_SRC" ]]; then
  echo "profile source not found: $PROFILE_SRC (set DSH_PROFILE_SRC)" >&2
  exit 2
fi

mkdir -p "$WORK/profiles" "$WORK/.agent-presets"
ln -s "$PROFILE_SRC" "$WORK/profiles/web"
if [[ -d "$HOME/.dsh/.agent-presets/opencode-omo" ]]; then
  cp -a "$HOME/.dsh/.agent-presets/opencode-omo" "$WORK/.agent-presets/"
fi

DSH_HOME="$WORK" "$DSH_BIN" --profile web --port "$PORT" --no-open > "$WORK/boot.log" 2>&1 &
PID=$!

up=""
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$PORT/plugins/@royenheart/dsh-plugin-opencode-omo/roles" > "$WORK/roles.json" 2>/dev/null; then
    up="1"
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "boot process died:" >&2
    tail -30 "$WORK/boot.log" >&2
    exit 1
  fi
  sleep 2
done

if [[ -z "$up" ]]; then
  echo "roles endpoint never came up" >&2
  tail -30 "$WORK/boot.log" >&2
  exit 1
fi

if grep -qiE "ERR_MODULE_NOT_FOUND|Cannot find package" "$WORK/boot.log"; then
  echo "boot log contains module-resolution errors:" >&2
  grep -iE "ERR_MODULE_NOT_FOUND|Cannot find package" "$WORK/boot.log" >&2
  exit 1
fi

node -e "
  const r = require('$WORK/roles.json')
  if (!r.ok) { console.error('roles endpoint reported !ok'); process.exit(1) }
  if (!r.roles.some(x => x.id === 'oracle')) { console.error('oracle role missing'); process.exit(1) }
  console.log('boot smoke OK —', r.roles.length, 'roles, oracle present, clean boot log')
"
