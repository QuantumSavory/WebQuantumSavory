#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$app_root/ci/instantiate-julia.sh"
cd "$app_root/test"
exec julia --project=. runtests.jl test_unit
