#!/usr/bin/env bash
# Build this package with the toolchain borrowed from the sibling
# dsh-plugin-server checkout (the plugin workspace has no pnpm install).
# `node_modules` is a symlink to that package's installed toolchain.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules/.bin ]]; then
  ln -s ../dsh-plugin-server/node_modules node_modules
fi

node_modules/.bin/tsc --noEmit -p tsconfig.json
node_modules/.bin/tsdown
