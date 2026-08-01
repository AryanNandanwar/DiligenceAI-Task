#!/usr/bin/env bash
# Expose the local MCP server (port 3001) via a public HTTPS Cloudflare quick tunnel.
# Prerequisites: docker compose stack running (`docker compose up -d`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! curl -sf http://localhost:3001/health >/dev/null; then
  echo "MCP health check failed. Starting docker compose..."
  docker compose up -d --build
  echo "Waiting for MCP..."
  for i in $(seq 1 40); do
    if curl -sf http://localhost:3001/health >/dev/null; then
      break
    fi
    sleep 2
  done
fi

curl -sf http://localhost:3001/health >/dev/null || {
  echo "MCP still unhealthy on :3001"
  exit 1
}

echo "Starting Cloudflare quick tunnel → http://localhost:3001"
echo "Copy the https://*.trycloudflare.com URL into README / email / Cursor mcp.json"
echo
exec npx --yes cloudflared tunnel --url http://localhost:3001 --no-autoupdate
