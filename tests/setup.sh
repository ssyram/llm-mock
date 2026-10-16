#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
git submodule update --init --recursive vendor/pi-mono
cd vendor/pi-mono
npm ci --workspace packages/ai --workspace packages/telemetry --include-workspace-root --ignore-scripts --no-audit --no-fund
npm run build --workspace packages/telemetry
cd ../../tests
npm ci --ignore-scripts --no-audit --no-fund
node --input-type=module -e 'await import("./pi-ai-imports.mjs"); console.log("Pinned pi-ai reference is ready")'
