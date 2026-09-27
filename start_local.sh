#!/bin/bash
# Start the backend and frontend together for local development.
#   bash start_local.sh
# Output from both is interleaved with a [backend]/[frontend] prefix.
# Ctrl-C stops both.

cd "$(dirname "$0")"

# The nightly Google Drive backup is off for local dev runs (it errors hourly when
# Drive isn't mounted). Opt back in with: BACKUP_LOOP_ENABLED=1 bash start_local.sh
export BACKUP_LOOP_ENABLED="${BACKUP_LOOP_ENABLED:-0}"

# Let other tailnet devices open http://<this machine>:5173 (local dev only —
# production sets none of these). Plain http means the session cookie can't be
# Secure; Vite listens on all interfaces; the backend accepts these origins.
HOST_SHORT=$(hostname -s | tr '[:upper:]' '[:lower:]')
TS_CLI=$(command -v tailscale || echo /Applications/Tailscale.app/Contents/MacOS/Tailscale)
TS_IP=$("$TS_CLI" ip -4 2>/dev/null | head -1)
TS_DNS=$("$TS_CLI" status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null)
export COOKIE_SECURE=0
export VITE_DEV_HOST=0.0.0.0
export DEV_EXTRA_ORIGINS="http://$HOST_SHORT:5173${TS_IP:+,http://$TS_IP:5173}${TS_DNS:+,http://$TS_DNS:5173}"
echo "From other tailnet devices: http://$HOST_SHORT:5173"

if [ ! -d frontend/node_modules ]; then
    echo "Installing frontend dependencies..."
    (cd frontend && npm install) || exit 1
fi

pids=()

cleanup() {
    trap - INT TERM EXIT
    echo
    echo "Stopping backend and frontend..."
    for pid in "${pids[@]}"; do
        # Kill the whole process group so uvicorn's reloader and vite's children go too
        kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null
    done
    wait 2>/dev/null
    exit 0
}
trap cleanup INT TERM EXIT

# set -m gives each background job its own process group
set -m
bash backend/start.sh 2>&1 | sed -u 's/^/[backend]  /' &
pids+=($!)
bash frontend/start.sh 2>&1 | sed -u 's/^/[frontend] /' &
pids+=($!)
set +m

# Exit (and stop the other) as soon as either one dies
while true; do
    for pid in "${pids[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "A process exited; shutting down."
            exit 1
        fi
    done
    sleep 1
done
