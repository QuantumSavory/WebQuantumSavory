#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$app_root/ci/instantiate-julia.sh"

cd "$app_root/test"
julia --project=. runtests.jl test_mcp_unit
julia --project=. runtests.jl test_sidecar_supervisor

julia --startup-file=no --project="$app_root/mcp" -e 'using Pkg; Pkg.instantiate()'
julia --startup-file=no --project="$app_root/mcp" "$app_root/mcp/test/runtests.jl"

export WEBQUANTUMSAVORY_ENABLE_MCP=true
export WEBQUANTUMSAVORY_MCP_PORT=18001
exec "$app_root/ci/run-with-server.sh" mcp \
  julia --startup-file=no --project=. test/http_integration.jl
