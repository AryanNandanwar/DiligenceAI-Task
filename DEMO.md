# Async demo checklist (4–5 minutes)

Record with Loom / OBS. Keep the **hosted** MCP in frame — reviewers should not need a local setup.

## Before recording

1. `docker compose up -d` (if using the Cloudflare tunnel path)
2. Keep the tunnel running (`./scripts/start-tunnel.sh`) and confirm:
   - `curl https://<tunnel>/health` → ok
   - `./scripts/verify-workflow.sh` with `MCP_URL=https://<tunnel>`
3. Point Cursor (or Claude Desktop) at the **hosted** MCP URL:
   ```json
   { "mcpServers": { "o2c-ops": { "url": "https://<tunnel>/mcp" } } }
   ```
4. Optional: `docker compose down -v && docker compose up -d` so broken orders are fresh.

## Suggested script (~4:30)

| Time | Show | Say |
|---|---|---|
| 0:00–0:40 | README architecture diagram + hosted URL | User = ops; problem = O2C exceptions without engineering tickets; MCP is the product surface |
| 0:40–1:20 | Cursor MCP panel green + tool list | Remotely hosted Streamable HTTP MCP; 19 tools; writes require `reason` |
| 1:20–2:20 | Agent: “What needs attention?” | `ops_summary` → 7 issues; highlight ORD-1107 reconcile caution |
| 2:20–3:20 | Agent: “Why is ORD-1102 stuck? Fix it.” | `diagnose_order` → `create_shipment`; show audit reason |
| 3:20–4:00 | Quick second path (pick one): ORD-1107 reconcile **or** ORD-1105 release reservations | Safety / judgment: don’t double-charge; inventory consistency |
| 4:00–4:30 | PRODUCT.md tradeoffs + verify script | What you excluded; how you verified; tunnel vs Render |

## Must-show moments

- Hosted URL (not only `localhost`)
- At least one MCP tool call visible in the agent trace (not shell/`curl`)
- Diagnose-before-mutate
- Audit/`reason` on a write

## After recording

Email the Loom link with: hosted MCP URL, repo URL, pointer to `PRODUCT.md` + `AI_WORKLOG.md`, and note that the tunnel must be up during review (or paste the Render URL if you deployed the Blueprint).
