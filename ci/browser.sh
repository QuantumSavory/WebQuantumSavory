#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$app_root/ci/instantiate-julia.sh"
"$app_root/ci/frontend-build.sh"
julia --startup-file=no --project="$app_root/mcp" -e 'using Pkg; Pkg.instantiate()'

cd "$app_root/gui"
if [ "${PLAYWRIGHT_INSTALL_SYSTEM_DEPS:-false}" = true ]; then
  npx playwright install --with-deps chromium
else
  npx playwright install chromium
fi

export CI=true
export WEBQUANTUMSAVORY_ENABLE_MCP=true
export WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION=true
export WEBQUANTUMSAVORY_MOCK_BROKEN=true
exec "$app_root/ci/run-with-server.sh" gui npm test
