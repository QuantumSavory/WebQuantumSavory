#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$app_root/ci/instantiate-julia.sh"
"$app_root/ci/frontend-build.sh"
export WEBQUANTUMSAVORY_MOCK_BROKEN=true
exec "$app_root/ci/run-with-server.sh" test \
  julia --project=. runtests.jl test_integration test_simulation_integration
