# Product decisions, assumptions, and exclusions

## User and problem

**User:** E-commerce operations specialist (support / order-management), not an engineer.

**Problem:** Day-to-day Order-to-Cash exceptions (stuck payments, missing shipments, invoice gaps, reservation leaks, refunds) currently require engineering tickets. Ops should diagnose and resolve these through an AI agent that uses safe, audited tools.

## Workflow (in scope)

1. Ask “what needs attention?” → `ops_summary`
2. Pick a flagged order → `diagnose_order` (rules engine + suggested fix tools)
3. Apply the suggested write tool with a mandatory `reason` → mutation + audit log
4. Optionally verify via `get_order` / `get_audit_log`

Seeded demo orders: `ORD-1101` … `ORD-1107` (see README).

## Assumptions

- Ops already has an MCP-capable client (Cursor, Claude Desktop, etc.); we do not ship a chat UI.
- Payment gateway behavior is simulated (deterministic retry / reconcile markers in seed data).
- Synthetic catalog/customers/orders only — no real PII or production credentials.
- Write actions are trusted within the demo perimeter; auth/RBAC is out of scope for this week’s slice.
- “Remote hosting” for review prefers Render Blueprint (`render.yaml`) for a fixed free URL; Cloudflare named/quick tunnels remain local fallbacks.

## Exclusions (intentional)

- Storefront, cart, catalog CMS, or full commerce backend
- Real payment / shipping / tax integrations
- AuthN/AuthZ, multi-tenant isolation, SSO
- Frontend / design system
- Production-grade migrations, CI/CD, observability, autoscaling
- Human-in-the-loop approval workflow beyond mandatory `reason` + audit trail

## Safety / operational choices

- Every mutating MCP tool requires `reason` (and optional `actor`); backend writes an immutable audit row with before/after snapshots.
- `force_order_status` is constrained by an explicit state machine; shipping/cancel side effects update inventory.
- `reconcile_payment` exists so agents do not blindly `retry_payment` when the gateway may already have captured funds (`gw_ok_*` marker).
- MCP is a thin, well-described tool layer over REST — agents get diagnostics first, then targeted fixes.
- No destructive “wipe database” tool exposed via MCP.

## Tradeoffs

| Choice | Why | Cost |
|---|---|---|
| MCP-only (no chat UI) | Matches assignment (“don’t overbuild frontend”); MCP stays central | Reviewers need an MCP client or the verify script |
| NestJS + TypeORM `synchronize` | Fast iteration for demo schema | Not production migration hygiene |
| Stateless Streamable HTTP MCP | Easy to host / tunnel; works with Cursor URL connectors | No long-lived SSE sessions |
| Render Blueprint (preferred remote) | Fixed `*.onrender.com` URL; no domain; laptop optional | Free web cold starts; free Postgres expires in 30 days |
| Cloudflare named tunnel | Fixed hostname; Docker stays local | Needs Cloudflare zone/domain; laptop must stay up |
| Cloudflare quick tunnel fallback | HTTPS in minutes, no domain | Ephemeral hostname on each restart |
| ~19 tools covering full O2C exceptions | Coherent ops independence story | Broader than a single-scenario slice |

## Next steps (if continuing)

- Add light auth (shared bearer) on MCP + backend for the public URL
- Approval gates for high-risk actions (refunds above threshold, force-status)
- Replace simulated gateway with sandbox Stripe/Razorpay
- Automated integration tests in CI against `docker compose`
