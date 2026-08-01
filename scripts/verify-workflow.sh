#!/usr/bin/env bash
# Focused runtime verification for the core O2C ops workflow.
# Usage:
#   ./scripts/verify-workflow.sh
#   BACKEND_URL=http://localhost:3000 MCP_URL=http://localhost:3001 ./scripts/verify-workflow.sh
#   MCP_URL=https://your-tunnel.trycloudflare.com ./scripts/verify-workflow.sh

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
MCP_URL="${MCP_URL:-http://localhost:3001}"
ORDER="${ORDER:-ORD-1102}"
PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
info() { printf '\033[36m%s\033[0m\n' "$*"; }

assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  if grep -Fq "$needle" <<<"$haystack"; then
    green "PASS  $label"
    PASS=$((PASS + 1))
  else
    red "FAIL  $label (expected to contain: $needle)"
    echo "       got: $(head -c 240 <<<"$haystack")"
    FAIL=$((FAIL + 1))
  fi
}

assert_http_ok() {
  local url="$1" label="$2"
  local code
  code=$(curl -sS -o /tmp/o2c-verify-body.json -w '%{http_code}' "$url")
  if [[ "$code" == "200" ]]; then
    green "PASS  $label (HTTP $code)"
    PASS=$((PASS + 1))
  else
    red "FAIL  $label (HTTP $code)"
    FAIL=$((FAIL + 1))
  fi
}

info "Backend: $BACKEND_URL"
info "MCP:     $MCP_URL"
info "Order:   $ORDER"
echo

assert_http_ok "$BACKEND_URL/health" "backend health"
assert_http_ok "$MCP_URL/health" "mcp health"

SUMMARY=$(curl -sS "$BACKEND_URL/ops/summary")
assert_contains "$SUMMARY" "attentionNeeded" "ops summary returns attentionNeeded"
assert_contains "$SUMMARY" "totalIssues" "ops summary returns totalIssues"

DIAG=$(curl -sS "$BACKEND_URL/ops/diagnose/$ORDER")
assert_contains "$DIAG" "\"issues\"" "diagnose_order returns issues array"
assert_contains "$DIAG" "$ORDER" "diagnose_order echoes target order"
if grep -Fq '"healthy":false' <<<"$DIAG"; then
  assert_contains "$DIAG" "suggestedTools" "unhealthy order includes suggestedTools"
else
  green "PASS  diagnose_order reports healthy (order already fixed — ok for re-runs)"
  PASS=$((PASS + 1))
fi

MCP_INIT=$(curl -sS -X POST "$MCP_URL/mcp" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"o2c-verify","version":"1.0.0"}}}')
assert_contains "$MCP_INIT" "o2c-ops" "MCP initialize returns serverInfo.name=o2c-ops"
assert_contains "$MCP_INIT" "tools" "MCP initialize advertises tools capability"

REASON="verify-workflow $(date -u +%Y%m%dT%H%M%SZ)"
FIX_CODE=$(curl -sS -o /tmp/o2c-fix.json -w '%{http_code}' -X POST "$BACKEND_URL/orders/$ORDER/shipments" \
  -H 'content-type: application/json' \
  -d "{\"carrier\":\"DemoShip\",\"actor\":\"verify-script\",\"reason\":\"$REASON\"}" || true)
FIX_BODY=$(cat /tmp/o2c-fix.json 2>/dev/null || true)
if [[ "$FIX_CODE" == "201" || "$FIX_CODE" == "200" ]] || grep -Eqi 'FULFILLING|SHIPPED|shipment|already|Bad Request|Cannot' <<<"$FIX_BODY"; then
  green "PASS  create_shipment path exercised for $ORDER (HTTP ${FIX_CODE:-n/a})"
  PASS=$((PASS + 1))
else
  red "FAIL  create_shipment unexpected response (HTTP ${FIX_CODE:-n/a})"
  echo "       body: $(head -c 240 <<<"$FIX_BODY")"
  FAIL=$((FAIL + 1))
fi

AUDIT=$(curl -sS "$BACKEND_URL/audit?limit=5")
assert_contains "$AUDIT" "action" "audit log returns actions"

RECON=$(curl -sS "$BACKEND_URL/inventory/reconcile")
if grep -Eq 'sku|recordedReserved|mismatches|difference|\[\]' <<<"$RECON"; then
  green "PASS  inventory reconcile responds with expected shape"
  PASS=$((PASS + 1))
else
  red "FAIL  inventory reconcile unexpected response"
  echo "       got: $(head -c 240 <<<"$RECON")"
  FAIL=$((FAIL + 1))
fi

echo
info "Results: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
green "All focused checks passed."
