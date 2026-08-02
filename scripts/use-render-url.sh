#!/usr/bin/env bash
# Point project docs + Cursor MCP config at a deployed Render MCP base URL.
#
# Usage:
#   ./scripts/use-render-url.sh https://o2c-mcp.onrender.com
#   ./scripts/use-render-url.sh https://o2c-mcp-xxxx.onrender.com
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="${1:-}"

usage() {
  echo "Usage: $0 https://<o2c-mcp-service>.onrender.com"
  exit 1
}

[[ -n "$RAW" ]] || usage

# Normalize: strip trailing slash and optional /mcp|/health suffix.
BASE="${RAW%/}"
BASE="${BASE%/mcp}"
BASE="${BASE%/health}"

if [[ ! "$BASE" =~ ^https://[a-zA-Z0-9.-]+\.onrender\.com$ ]]; then
  echo "Expected an https://*.onrender.com base URL, got: $RAW"
  exit 1
fi

MCP_JSON="$ROOT/.cursor/mcp.json"
README="$ROOT/README.md"

mkdir -p "$(dirname "$MCP_JSON")"
cat >"$MCP_JSON" <<EOF
{
  "mcpServers": {
    "o2c-ops": {
      "url": "${BASE}/mcp"
    }
  }
}
EOF

if [[ -f "$README" ]]; then
  sed -i -E "s|https://[a-zA-Z0-9.-]+\.onrender\.com|${BASE}|g" "$README"
  sed -i -E "s|https://[a-zA-Z0-9-]+\.trycloudflare\.com|${BASE}|g" "$README"
  sed -i -E "s|https://mcp\.yourdomain\.com|${BASE}|g" "$README"
fi

echo "Render MCP URL configured:"
echo "  MCP    : ${BASE}/mcp"
echo "  Health : ${BASE}/health"
echo "  wrote  : ${MCP_JSON}"
echo "  updated: README.md hosts (onrender / prior tunnel placeholders)"
echo
echo "Reload the MCP server in Cursor, then:"
echo "  curl ${BASE}/health"
echo "  MCP_URL=${BASE} ./scripts/verify-workflow.sh"
