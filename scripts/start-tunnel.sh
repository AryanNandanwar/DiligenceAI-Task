#!/usr/bin/env bash
# Expose the local MCP server (port 3001) via a public HTTPS Cloudflare quick tunnel.
# When cloudflared prints a new hostname, rewrites:
#   - .cursor/mcp.json
#   - README.md (every https://*.trycloudflare.com occurrence)
# Prerequisites: docker compose stack running (`docker compose up -d`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MCP_JSON="$ROOT/.cursor/mcp.json"
README="$ROOT/README.md"
URL_RE='https://[a-zA-Z0-9-]+\.trycloudflare\.com'

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

update_docs_with_url() {
  local base="$1" # https://xxx.trycloudflare.com (no path)

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
    # Swap only the origin; /mcp and /health path suffixes in README stay intact.
    sed -i -E "s|${URL_RE}|${base}|g" "$README"
  fi

  echo
  echo "Updated tunnel URL → ${base}"
  echo "  wrote ${MCP_JSON}"
  echo "  rewrote trycloudflare.com hosts in README.md"
  echo "Reload MCP in Cursor if it was already connected (Settings → MCP, or restart the server)."
  echo
}

echo "Starting Cloudflare quick tunnel → http://localhost:3001"
echo "Will auto-update .cursor/mcp.json and README.md when the public URL appears."
echo

UPDATED=0
# Process substitution keeps this loop in the current shell (so file updates aren't lost in a pipe subshell).
# cloudflared prints the public URL on stderr; merge streams.
while IFS= read -r line || [[ -n "$line" ]]; do
  printf '%s\n' "$line"
  if [[ "$UPDATED" -eq 0 ]] && [[ "$line" =~ https://[a-zA-Z0-9-]+\.trycloudflare\.com ]]; then
    update_docs_with_url "${BASH_REMATCH[0]}"
    UPDATED=1
  fi
done < <(npx --yes cloudflared tunnel --url http://localhost:3001 --no-autoupdate 2>&1)
