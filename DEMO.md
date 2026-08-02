# Async demo — Loom walkthrough script (~4:30–5:00)

Record with Loom / OBS. Speak naturally; use the lines below as a teleprompter, not a rigid recital.

## Before you hit Record

1. Fresh demo data: `docker compose down -v && docker compose up -d`
2. Tunnel running: `./scripts/start-tunnel.sh` (or keep the existing one)
3. Confirm: `curl https://<your-tunnel>/health` → ok
4. Cursor → MCP panel: `o2c-ops` green, URL is the **hosted** `…/mcp` (not localhost)
5. Open three tabs ready to switch:
   - README (architecture + hosted URL)
   - Cursor Agent chat (empty)
   - Terminal (for a quick health/`verify` flash at the end)
6. Have these prompts pasted and ready:
   - `Using the o2c-ops MCP tools only: what needs attention in our order pipeline right now?`
   - `Using o2c-ops MCP tools only: why is order ORD-1102 stuck? Diagnose it, then fix it.`
   - `Using o2c-ops MCP tools only: a customer says they were charged for ORD-1107 but it shows unpaid. Investigate carefully — do not double-charge them.`

---

## Spoken script

### 0:00–0:45 — Problem, user, and product bet

**[Screen: README title + architecture diagram; highlight Hosted MCP URL]**

Hi — I’m Aryan. This is an AI-native Order-to-Cash ops tool for an e-commerce operations team.

Today, when payments stick, shipments never get created, invoices are wrong, or inventory reservations leak, ops usually files a ticket and waits on engineering. I built a small system where ops talks to an AI agent instead, and the agent resolves those exceptions through tools.

The product surface is not a custom chat UI — it’s a remotely hosted MCP server. Any MCP client can connect. Cursor is what I’ll use in this demo.

Here’s the hosted MCP URL reviewers can hit without cloning the repo — Streamable HTTP over HTTPS. Behind it: a TypeScript MCP server, a NestJS backend, and Postgres with synthetic broken orders.

---

### 0:45–1:20 — MCP is central

**[Screen: Cursor Settings → Tools & MCP → o2c-ops green; expand tool list if possible]**

The MCP exposes about nineteen tools. Roughly half are diagnostics — summary, search, diagnose, inventory reconcile, audit log. The rest are guarded fixes — retry or reconcile payment, create shipment, generate or regenerate invoice, issue refund, release reservations, and so on.

Every write requires a reason string, and the backend records actor, action, and before/after in an audit log. So ops stays independent, but actions stay traceable.

I deliberately did not build auth, a storefront, or a full commerce backend — scope is the exception workflow only.

---

### 1:20–2:25 — Workflow part 1: fleet attention

**[Screen: Cursor Agent. Paste prompt 1. Wait for MCP tool calls — point at `ops_summary` in the trace]**

First prompt: what needs attention right now.

You should see the agent call `ops_summary` on the hosted MCP — not curl against the repo.

It returns a handful of seeded issues: stuck payments like ORD-1101 and ORD-1107, a paid order with no shipment — ORD-1102 — missing or mismatched invoices, a pending refund, and an inventory reservation leak on the smart watch SKU.

That summary is the ops homepage. Next we drill into one order.

---

### 2:25–3:25 — Workflow part 2: diagnose, then fix

**[Screen: Paste prompt 2 for ORD-1102. Point at `diagnose_order`, then `create_shipment`]*

Second prompt: why is ORD-1102 stuck — diagnose, then fix.

The important product behavior is diagnose-before-mutate. `diagnose_order` runs a rules engine over the order timeline and returns severity plus suggested tools. For ORD-1102 it should say paid with no shipment, and suggest `create_shipment`.

When the agent fixes it, watch for a reason argument on the write. That’s what lands in the audit trail.

After the fix, the order should move into fulfillment — ops just resolved a three-day stuck order without engineering.

---

### 3:25–4:15 — Safety judgment (second scenario)

**[Screen: Paste prompt 3 for ORD-1107. Point at `reconcile_payment`, not blind `retry_payment`]*

Quick second path — this is the safety decision I care about most.

ORD-1107 looks like a failed payment, but the seed data simulates a gateway timeout where the charge actually captured. If the agent retries blindly, you double-charge the customer.

So the diagnose rules suggest `reconcile_payment` first. I’m asking the agent to investigate carefully and not double-charge.

If it calls reconcile and marks the order paid from the gateway record, that’s the intended behavior. That’s why MCP tool descriptions and backend rules matter as much as the endpoints.

---

### 4:15–5:00 — Decisions, verification, how to try it

**[Screen: flash PRODUCT.md headings, then terminal with health + verify]**

To close: assumptions and exclusions are in PRODUCT.md — no frontend, no real payment gateway, no auth for this slice. Hosting for review is a public Cloudflare tunnel in front of Docker; there’s also a Render blueprint if you want a longer-lived URL.

I verified the important path with a focused script — health, summary, diagnose, MCP initialize, a write path, and audit — against both localhost and the hosted URL.

Repo has the README, PRODUCT.md, AI worklog, and the verify script. Hosted MCP URL is at the top of the README.

Thanks for watching — happy to go deeper on any tradeoff.

---

## On-screen checklist (don’t skip)

- [ ] Hosted URL visible (not only localhost)
- [ ] MCP tool call visible in agent trace (`ops_summary` / `diagnose_order`)
- [ ] Diagnose before mutate
- [ ] Write includes `reason`
- [ ] ORD-1107 = reconcile, not reckless retry
- [ ] Mention what you excluded + how you verified

## If time is tight (~3:45 cut)

Drop the ORD-1107 section; keep summary → ORD-1102 diagnose/fix → close with hosting + verify + exclusions.

## After recording

Email: Loom link, hosted MCP URL, repo URL, note that the tunnel must stay up during review (or Render URL if deployed).
