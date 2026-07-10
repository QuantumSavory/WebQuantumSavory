#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

node --version
npm --version
npm --prefix "$app_root/gui" ci --include=dev
npm --prefix "$app_root/gui" run build
git -C "$app_root" diff --exit-code -- gui/package.json gui/package-lock.json
