#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$app_root/ci/instantiate-julia.sh"
"$app_root/ci/frontend-build.sh"

cd "$app_root/gui"
if [ "${PLAYWRIGHT_INSTALL_SYSTEM_DEPS:-false}" = true ]; then
  npx playwright install --with-deps chromium
else
  npx playwright install chromium
fi

export CI=true
exec "$app_root/ci/run-with-server.sh" gui npm test
