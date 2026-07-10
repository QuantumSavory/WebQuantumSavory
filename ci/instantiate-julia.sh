#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

julia --version
julia --project="$app_root" -e 'using Pkg; Pkg.instantiate()'
julia --project="$app_root/test" -e 'using Pkg; Pkg.instantiate()'
