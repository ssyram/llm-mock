#!/bin/sh
# pi-ai file: dependency. npm computes the symlink target relative to the
# package.json location, producing a broken link for targets outside the
# repo; recreate it relative to (or absolute for) the real pi-mono checkout.
set -e
cd "$(dirname "$0")"
npm install --no-audit --no-fund
rm -rf node_modules/@earendil-works
mkdir -p node_modules/@earendil-works
ln -s "$(cd ../pi-mono/packages/ai && pwd)" node_modules/@earendil-works/pi-ai
echo "pi-ai linked to: $(readlink node_modules/@earendil-works/pi-ai)"
