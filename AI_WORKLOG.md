# AI worklog

## Tools and models used

| Phase | Tool / model | Why |
|---|---|---|
| Scope + architecture | Cursor Agent (planning mode) | Forced explicit product questions (MCP-only vs chat UI; which O2C scenarios) before coding |
| Implementation | Cursor Agent + AI coding assistance in-repo | Fast scaffolding of NestJS modules, TypeORM entities, MCP tool layer, Dockerfiles |
| Debugging TypeORM / TS | Cursor Agent | Resolved `process` typing and TypeORM `relations` typing mismatches after build failures |
| MCP client wiring | Cursor Agent + Cursor MCP settings | Connected Streamable HTTP server into Cursor; diagnosed when Agent used `curl` instead of MCP tools |
| Submission gaps | Cursor Agent (Grok 4.5 / this session) | Hosted tunnel, verify script, product/docs packaging |

Exact model SKUs varied by Cursor session; planning was done in Plan mode, implementation in Agent mode. No separate Claude Code / Codex CLI session was required for the core build.

## How AI planned and broke down the work

1. Clarified interface choice: **MCP-only** (no custom chat UI) — keeps MCP central and matches “don’t overbuild frontend.”
2. Chose full O2C exception coverage with seeded broken orders rather than one lonely scenario.
3. Split work into: entities/seed → services/REST → diagnose rules → MCP tools → Docker → verify/README.
4. Deferred auth, real gateways, and polished UI as explicit exclusions.

## Division of responsibilities

**Human owned:** product framing (ops independence via O2C), scope bounds, acceptance of MCP-only UX, demo narrative, final review of safety choices (audit reason, reconcile-before-retry), submission packaging decisions.

**AI owned:** boilerplate NestJS/MCP/Docker scaffolding, first-pass tool schemas/descriptions, seed scenario drafting, iterative type-error fixes, README structure, verify script and hosting tunnel setup.

## Important prompts / context supplied

- “Ops speaks to an AI agent and solves issues without engineering” + NestJS + MCP + Postgres + Docker constraints.
- Preference for MCP client integration over building a chat UI.
- Assignment requirement for a **remotely accessible** MCP and focused verification (addressed in the submission-gaps pass).

## AI suggestion corrected / rejected

**TypeORM `relations` object syntax + missing Node types.**  
AI initially wrote `relations: { order: true }` / nested object forms and assumed `@types/node` would resolve `process` automatically. The installed TypeORM/TS combination failed typecheck. Fix applied: explicit `"types": ["node"]` in `tsconfig.json`, expose `orderId` on `Invoice`, and use string-array `relations: ['order']` / `where: { orderId }` where needed. This was a human-supervised correction of AI-generated typing assumptions—not a product change.

**Secondary correction (client usage):** when demonstrating “what needs attention?”, an Agent session explored the repo and called REST via shell instead of MCP tools. That was rejected as a demo path; config was fixed so Cursor loads `o2c-ops` and prompts explicitly request MCP tool use.

## How AI-generated work was verified

- `docker compose up -d --build` → backend + MCP health endpoints
- `GET /ops/summary` shows 7 seeded issues
- Per-order `GET /ops/diagnose/:order` for ORD-1101…1107
- MCP `initialize` over HTTP (local and Cloudflare tunnel)
- `./scripts/verify-workflow.sh` focused checks (health, summary, diagnose, MCP initialize, create_shipment path, audit, inventory reconcile)

## Remaining risks / unfinished work

- Cloudflare quick tunnel hostname is **ephemeral** and requires the local Docker stack + tunnel process to stay up during review (or migrate to Render Blueprint).
- No automated CI; verification is a local/runtime script.
- No auth on the public MCP URL (acceptable for synthetic demo; not for production).
- Async demo video and email-thread collaboration artifacts are human deliverables outside the repo.
- Free Render Postgres plans change over time; Blueprint may need a paid/Neon database swap.
