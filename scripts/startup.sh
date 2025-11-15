#!/usr/bin/env bash

set -euo pipefail

: "${WS_PORT:=${VITE_WS_PORT:-8080}}"
export WS_PORT

echo "[startup] launching WebSocket command server on port ${WS_PORT}..."
bun ./websocket.ts &

echo "[startup] starting Cloudflare Sandbox control plane..."

exec bun dist/index.js
