#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$app_root/ci/instantiate-julia.sh"
"$app_root/ci/frontend-build.sh"
unset WEBQUANTUMSAVORY_ENABLE_MCP WEBQUANTUMSAVORY_MCP_PORT
export WEBQUANTUMSAVORY_MOCK_BROKEN=true
exec "$app_root/ci/run-with-server.sh" test \
  julia --project=. runtests.jl test_integration test_simulation_integration
