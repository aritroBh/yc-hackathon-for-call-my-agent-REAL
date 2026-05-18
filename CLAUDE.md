# CLAUDE.md — Haggl Procurement Engine

## What This Is

Haggl is an autonomous procurement negotiation engine. It dispatches parallel AI voice agents to negotiate pricing, terms, and delivery with suppliers over phone calls in their native languages (Twi, Akan, Yoruba, Hindi). Claude Opus monitors calls in real-time and injects counterarguments invisibly into the Gemini negotiation voice agent.

**Core loop:** RFQ → Dispatch → BrowserUse (pre-call research) → Vapi outbound call → Gemini voice negotiation + Opus live injection → Haiku post-call extraction → Scoring → Results → Sponge payments + AgentMail confirmations + Supermemory storage.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend (main) | Next.js 14, React 18, Tailwind CSS, TypeScript |
| Frontend (dashboard) | Next.js 15 (`web/`), Zustand, pure React state |
| Backend | Next.js API routes + optional Express WebSocket bridge |
| Database | Supabase (PostgreSQL) with RLS |
| Voice orchestration | Vapi + Khaya TTS/ASR (West African languages) |
| Negotiation brain | Google Gemini Flash Lite (voice agent) |
| Live reasoning | Claude Opus 4.5 (real-time injection, async) |
| Post-call extraction | Claude Haiku 3.5 (structured data) |
| Payments | Sponge (supplier) + Stripe (buyer) |
| Email | AgentMail |
| Memory | Supermemory (supplier history, language context) |
| Market intel | Moss (semantic search, procurement facts) |
| Pre-call research | Browser Use |

---

## Directory Structure

```
haggl/                    # Main Next.js app (API + UI)
  app/api/                # REST endpoints
  lib/                    # Core engine (dispatcher, queue, injector, aggregator)
  lib/sponsors/           # Third-party integrations (moss, supermemory, agentmail, sponge, stripe)
  lib/negotiation/        # Provider-agnostic negotiation core
  lib/prompts/            # System prompt templates + dialect guidance
  components/             # React UI components
  workers/                # Background workers (call, RL)
web/                      # Atlas dashboard (isolated frontend)
  app/                    # Next.js 15 routes
  lib/store/              # Zustand state machine
  lib/data/               # Simulator + realtime bridge stubs
  lib/auth/               # Auth swap layer (mock → Supabase)
  components/             # Dashboard UI
db/
  schema.sql              # 8 tables + RLS policies
  seed.sql                # Dialect configs + test data
lib/                      # Root-level shared (legacy, prefer haggl/lib/)
server/                   # Audio codec (Mulaw ↔ PCM, Twilio)
src/services/             # Legacy service stubs (superseded by haggl/lib/)
types/                    # Shared TypeScript interfaces
```

---

## Agent Model Routing

Apply this routing for every task dispatched to a subagent:

| Task Type | Model |
|-----------|-------|
| Isolated edits, boilerplate, narrow transforms (1-2 files, complete spec) | Haiku |
| Feature implementation, refactors, multi-file integration | Sonnet |
| Architecture decisions, root-cause analysis, security review, multi-file invariants | Opus |
| Real-time call reasoning (production, already wired) | Opus (opusInjector) |
| Post-call extraction (production, already wired) | Haiku (aggregator) |

Escalate model tier only when lower tier fails with a clear reasoning gap.

---

## Key Entry Points

| What | Where |
|------|-------|
| Dispatch RFQ to suppliers | `haggl/app/api/dispatch/route.ts` |
| Create/list RFQs | `haggl/app/api/rfqs/route.ts` |
| Vapi call-end webhook | `haggl/app/api/vapi/webhook/route.ts` |
| Custom Khaya TTS endpoint | `haggl/app/api/vapi/voice/route.ts` |
| Call results + scoring | `haggl/app/api/results/route.ts` |
| Env var schema (Zod, 39 vars) | `haggl/lib/env.ts` |
| Supabase client + query helpers | `lib/db.ts` (root), `haggl/lib/db.ts` (preferred) |
| Floor price encryption | `haggl/lib/encryption.ts` |
| Live Opus reasoning | `haggl/lib/opusInjector.ts` |
| Post-call extraction | `haggl/lib/aggregator.ts` |
| Call dispatch orchestration | `haggl/lib/dispatcher.ts` |
| Priority call queue | `haggl/lib/queue.ts` |
| Negotiation core (Gemini) | `haggl/lib/negotiation/core.ts` |

---

## Database Schema (8 Tables)

- `dialect_configs` — Regional language/cultural profiles (Twi, Yoruba, Hindi, etc.)
- `suppliers` — Phone, email, reliability score, dialect config FK
- `rfqs` — Part specs (JSONB), quantity, target price, `floor_price_enc` (AES-256-GCM)
- `rfq_suppliers` — M:M join
- `calls` — Call state, transcript, quoted_price, lead_time_days, scores, recommended flag
- `call_transcripts` — Role (agent|supplier), content, timestamp
- `reasoning_traces` — Opus response, Moss results, injection latency, injected flag
- `feedback` — Buyer outcome (actual_price, delta %), RL flag

Full schema: `db/schema.sql`. TypeScript types: `types/database.ts`. API shapes: `types/api.ts`.

---

## Security Non-Negotiables

1. **Floor price is always encrypted.** `floor_price_enc` column stores AES-256-GCM ciphertext. Decrypt only server-side via `haggl/lib/encryption.ts`. Never log, expose in API response, or pass to client.

2. **RLS on all tables.** Users see only their own data (organization_id or user_id predicate). Never bypass RLS with a service-role key except in migrations.

3. **Auth middleware on all API routes.** `haggl/lib/authMiddleware.ts` validates session. Every new API route must apply it.

4. **Validate all POST bodies.** Use Zod schemas at API boundaries. No raw `req.body` access without parsing.

5. **No secrets in code.** All API keys via env vars. Schema enforced by `haggl/lib/env.ts`.

---

## Testing Standard

- Regression coverage required for every touched domain.
- Explicit edge-case assertions — not just happy path.
- Integration checks at interface boundaries (API routes, Supabase queries, sponsor clients).
- For sponsor integrations (Moss, Supermemory, Sponge, AgentMail): mock at the HTTP boundary, not the wrapper function.
- Raise bar for AI-generated code: reviewers focus on invariants, error boundaries, auth assumptions, hidden coupling.

---

## Agent-Driven Development Workflow

This project uses **subagent-driven development**. Every non-trivial feature or fix is:

1. **Decomposed** into 15-minute units (single dominant risk, verifiable done condition).
2. **Dispatched** to a fresh implementer subagent with full task text + relevant context (no session inheritance).
3. **Reviewed** in two stages: spec compliance first, then code quality.
4. **Committed** per task, not per feature.

**Before dispatching any subagent:**
- Extract the full task text and any context they need.
- Specify which files they should touch.
- State the done condition explicitly.
- Name the model tier (Haiku/Sonnet/Opus) based on complexity.

**Parallel dispatch rules:**
- Independent tasks (different files, no shared state) → dispatch in parallel.
- Tasks with shared state or ordering dependencies → sequential.
- Never dispatch multiple implementers to the same file simultaneously.

---

## Common Task Patterns

### Adding a new API route
1. Create `haggl/app/api/<name>/route.ts`.
2. Apply `authMiddleware` at the top.
3. Validate body with Zod schema from `types/api.ts` or inline.
4. Use query helpers from `haggl/lib/db.ts`, not raw Supabase client.
5. Return typed response matching shapes in `types/api.ts`.

### Adding a sponsor integration
1. Create `haggl/lib/sponsors/<name>.ts`.
2. Export named functions only — no default export.
3. All API keys via env vars (add to `haggl/lib/env.ts` schema).
4. Wrap external calls in try/catch — sponsor failures must not crash the call pipeline.
5. Log errors via `haggl/lib/logger.ts`.

### Extending the DB schema
1. Write migration SQL in `db/` (numbered, e.g., `002_add_column.sql`).
2. Update `types/database.ts` TypeScript interfaces.
3. Update RLS policies if new table.
4. Add query helpers to `haggl/lib/db.ts`.
5. Run `npm run db:migrate` to apply.

### Frontend state changes (web/)
- All state flows through `useAtlas` Zustand store via `ingestEvent(LiveCallEvent)`.
- Never mutate store state directly from components.
- Add selectors to `web/lib/store/selectors.ts` for derived/memoized views.
- Simulator (`web/lib/data/simulator.ts`) and realtime bridge (`web/lib/data/realtime.ts`) are swappable via one import in `store-hydrator.tsx`.

### Wiring real backend to web/ frontend
- See `web/HANDOFF.md` for the complete integration checklist.
- Replace `web/lib/auth/mock-auth.ts` → Supabase server client.
- Implement `web/lib/data/realtime.ts` WebSocket bridge.
- Backend emits `LiveCallEvent` from: Dispatcher, CallWorker, Vapi webhook, OpusInjector, Aggregator, finalizeCall.

---

## Environment Setup

All 39 env vars validated by `haggl/lib/env.ts` (Zod schema). Copy `.env.example` → `.env.local`. Required for core functionality:

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY           # Opus + Haiku
GOOGLE_AI_API_KEY            # Gemini
VAPI_API_KEY, VAPI_PHONE_NUMBER_ID
ENCRYPTION_KEY               # AES-256 floor price
```

Optional (sponsor integrations degrade gracefully if absent):
```
MOSS_API_KEY
SUPERMEMORY_API_KEY
AGENTMAIL_API_KEY
SPONGE_API_KEY
STRIPE_SECRET_KEY
BROWSER_USE_API_KEY
KHAYA_API_KEY
```

---

## Key Architecture Patterns

### Three-tier LLM stack (production)
- **Gemini Flash Lite** — conversational voice (low latency, real-time)
- **Claude Opus** — async reasoning injector (watches claims, fires ~2.5s debounce, 30s cooldown)
- **Claude Haiku** — post-call structured extraction (fast, cheap)

### Opus live injection
`haggl/lib/opusInjector.ts`: watches supplier turns → `shouldTrigger()` → calls Opus with Moss + Supermemory context → injects into Gemini session (invisible to supplier). 4s timeout, traces stored in `reasoning_traces`.

### Queue + Dispatcher + Worker
- `CallQueue` (in-memory, priority, persistent to DB): enqueue/dequeue, track in-flight
- `Dispatcher` (EventEmitter): session tracking, rate limiting, stagger jitter
- `CallWorker`: polls queue every 500ms → creates Vapi assistant + outbound call

### Dialect-driven prompting
10 regional profiles in `dialect_configs`. Each has `opening_style`, `pacing`, `code_switch_pattern`. System prompt assembled dynamically in `haggl/lib/promptBuilder.ts` + `haggl/lib/prompts/dialectPrompts.ts`.

### Reinforcement learning loop
`haggl/workers/rlWorker.ts` monitors feedback → `haggl/lib/patternExtraction.ts` → updates `dialect_configs` aggressiveness/pacing based on win rate.
