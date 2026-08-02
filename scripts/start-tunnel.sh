#!/usr/bin/env bash
# Expose the local MCP server (port 3001) via Cloudflare.
#
# Preferred: named tunnel (fixed hostname) when .cloudflared/config.yml exists
#   One-time: ./scripts/setup-named-tunnel.sh mcp.yourdomain.com
#
# Fallback: quick tunnel (ephemeral *.trycloudflare.com) — auto-updates
#   .cursor/mcp.json and README.md when the public URL appears.
#
# Prerequisites: docker compose stack running (`docker compose up -d`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MCP_JSON="$ROOT/.cursor/mcp.json"
README="$ROOT/README.md"
CF_DIR="$ROOT/.cloudflared"
CONFIG="$CF_DIR/config.yml"
HOST_FILE="$CF_DIR/hostname"
URL_RE='https://[a-zA-Z0-9-]+\.trycloudflare\.com'
CLOUDFLARED=(npx --yes cloudflared)

ensure_mcp_healthy() {
  if curl -sf http://localhost:3001/health >/dev/null; then
    return 0
  fi
  echo "MCP health check failed. Starting docker compose..."
  docker compose up -d --build
  echo "Waiting for MCP..."
  for i in $(seq 1 40); do
    if curl -sf http://localhost:3001/health >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "MCP still unhealthy on :3001"
  exit 1
}

update_docs_with_url() {
  local base="$1" # https://host (no path)

  mkdir -p "$(dirname "$MCP_JSON")"
  cat >"$MCP_JSON" <<EOF
{
  "mcpServers": {
    "o2c-ops": {
      "url": "${base}/mcp"
    }
  }
}
EOF

  if [[ -f "$README" ]]; then
    sed -i -E "s|${URL_RE}|${base}|g" "$README"
  fi

  echo
  echo "Updated tunnel URL → ${base}"
  echo "  wrote ${MCP_JSON}"
  echo "  rewrote trycloudflare.com hosts in README.md (if any)"
  echo "Reload MCP in Cursor if it was already connected."
  echo
}

ensure_mcp_healthy

if [[ -f "$CONFIG" ]]; then
  HOSTNAME="$(tr -d '[:space:]' <"$HOST_FILE" 2>/dev/null || true)"
  if [[ -z "$HOSTNAME" ]]; then
    # Parse hostname from ingress block as a fallback.
    HOSTNAME="$(awk '/hostname:/{ print $2; exit }' "$CONFIG")"
  fi
  BASE="https://${HOSTNAME}"

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

  echo "Starting Cloudflare *named* tunnel (fixed hostname)"
  echo "  config : $CONFIG"
  echo "  MCP    : ${BASE}/mcp"
  echo "  Health : ${BASE}/health"
  echo
  echo "This URL stays stable across restarts. Ctrl+C stops the tunnel."
  echo
  exec "${CLOUDFLARED[@]}" tunnel --config "$CONFIG" run
fi

echo "No named tunnel config at $CONFIG"
echo "Falling back to an ephemeral quick tunnel."
echo "For a fixed URL (requires a Cloudflare-managed domain):"
echo "  ./scripts/setup-named-tunnel.sh mcp.yourdomain.com"
echo
echo "Starting Cloudflare quick tunnel → http://localhost:3001"
echo

UPDATED=0
while IFS= read -r line || [[ -n "$line" ]]; do
  printf '%s\n' "$line"
  if [[ "$UPDATED" -eq 0 ]] && [[ "$line" =~ https://[a-zA-Z0-9-]+\.trycloudflare\.com ]]; then
    update_docs_with_url "${BASH_REMATCH[0]}"
    UPDATED=1
  fi
done < <("${CLOUDFLARED[@]}" tunnel --url http://localhost:3001 --no-autoupdate 2>&1)
