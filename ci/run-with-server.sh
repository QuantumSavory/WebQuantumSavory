#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
workdir=$1
shift

log_dir=$(mktemp -d "${TMPDIR:-/tmp}/webquantumsavory-ci.XXXXXX")
server_log="$log_dir/server.log"
artifact_dir="$app_root/ci-artifacts"
server_pid=

stop_server() {
  [ -n "$server_pid" ] || return 0
  if kill "$server_pid" 2>/dev/null; then
    attempts=0
    while kill -0 "$server_pid" 2>/dev/null && [ "$attempts" -lt 10 ]; do
      sleep 1
      attempts=$((attempts + 1))
    done

    if kill -0 "$server_pid" 2>/dev/null; then
      kill -KILL "$server_pid" 2>/dev/null || true
    fi
  fi
  wait "$server_pid" 2>/dev/null || true
}

collect_failure_artifacts() {
  mkdir -p "$artifact_dir"
  cp "$server_log" "$artifact_dir/server.log"

  if [ -d "$app_root/gui/test-results" ]; then
    cp -R "$app_root/gui/test-results" "$artifact_dir/"
  fi
  if [ -d "$app_root/gui/playwright-report" ]; then
    cp -R "$app_root/gui/playwright-report" "$artifact_dir/"
  fi
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  stop_server

  if [ "$status" -ne 0 ]; then
    collect_failure_artifacts
    echo "Backend log (last 200 lines):" >&2
    tail -n 200 "$server_log" >&2 || true
  fi

  rm -rf "$log_dir"
  exit "$status"
}

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

rm -rf "$artifact_dir"
: > "$server_log"
cd "$app_root"
GENIE_ENV=test julia --color=yes --project="$app_root" \
  -e 'using WebQuantumSavory; WebQuantumSavory.main(); WebQuantumSavory.up(async=false)' >"$server_log" 2>&1 &
server_pid=$!

ready=false
attempts=0
while [ "$attempts" -lt 120 ]; do
  if curl --fail --silent --show-error http://127.0.0.1:8000/status >/dev/null 2>&1; then
    ready=true
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "Backend exited before becoming ready." >&2
    exit 1
  fi
  attempts=$((attempts + 1))
  sleep 1
done

if [ "$ready" != true ]; then
  echo "Backend did not become ready within 120 seconds." >&2
  exit 1
fi

cd "$app_root/$workdir"
"$@"
