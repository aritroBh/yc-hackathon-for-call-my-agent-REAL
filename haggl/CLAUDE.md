# CLAUDE.md — haggl/ (Main App)

> See root `../CLAUDE.md` for project overview, tech stack, security rules, and agent routing.

## This Directory

The core Next.js 14 application: API routes, call pipeline engine, UI components, background workers.

---

## API Routes Map

| Route | Method | Purpose |
|-------|--------|---------|
| `app/api/dispatch/route.ts` | POST | Kick off RFQ dispatch to suppliers (core action) |
| `app/api/dispatch/route.ts` | GET | Dispatch session status (active calls, queue depth) |
| `app/api/dispatch/route.ts` | DELETE | Cancel dispatch session |
| `app/api/rfqs/route.ts` | GET/POST | List RFQs, create new RFQ (encrypts floor_price) |
| `app/api/calls/route.ts` | GET | Query calls by RFQ, status, or org |
| `app/api/results/route.ts` | GET | Completed calls + scoring for ranking |
| `app/api/feedback/route.ts` | POST | Buyer feedback (actual_price, price_delta) for RL |
| `app/api/suppliers/route.ts` | GET/POST | Supplier CRUD |
| `app/api/vapi/webhook/route.ts` | POST | Vapi call-end webhook → `finalizeCall()` |
| `app/api/vapi/voice/route.ts` | POST | Custom Khaya TTS endpoint for Vapi |
| `app/api/sponge/route.ts` | GET | Payment execution status |
| `app/api/supermemory/route.ts` | GET | Memory store access |
| `app/api/rl/route.ts` | POST | Trigger RL pattern extraction |

**Every new route must:** apply `lib/authMiddleware.ts`, validate body with Zod, use `lib/db.ts` query helpers.

---

## Core Library Files

### Call Pipeline

| File | Role |
|------|------|
| `lib/dispatcher.ts` | `Dispatcher` class (EventEmitter) — orchestrates multi-supplier dispatch, session tracking, rate limiting, stagger jitter |
| `lib/queue.ts` | `CallQueue` class (EventEmitter) — in-memory priority queue, tracks in-flight vs pending, persists to DB |
| `workers/callWorker.ts` | `CallWorker` — polls queue every 500ms, creates Vapi assistant + outbound call, handles retries |
| `lib/negotiation/core.ts` | Provider-agnostic negotiation brain (Gemini), `buildIntelContext()`, `liveHistory` Map (24 turns max) |
| `lib/opusInjector.ts` | `OpusInjector` — real-time Opus reasoning, 2.5s debounce, 4s timeout, 30s cooldown, traces to DB |
| `lib/aggregator.ts` | Post-call Haiku extraction → structured JSON (outcome, price, lead_time, certs, MOQ, terms) |
| `lib/triggerDetection.ts` | Detects supplier claims needing Opus rebuttal (`shouldTrigger()`) |
| `lib/scoring.ts` | Multi-factor supplier scoring (price/lead-time/quality → composite) |

### Prompt Assembly

| File | Role |
|------|------|
| `lib/promptBuilder.ts` | Dynamic system prompt assembly (dialect + RFQ + intel context) |
| `lib/prompts/negotiationPrompt.ts` | Base system prompt template |
| `lib/prompts/dialectPrompts.ts` | Twi/Yoruba/Hindi cultural guidance strings |

### Sponsor Integrations (`lib/sponsors/`)

Each is self-contained. All fail silently — sponsor errors must not crash the call pipeline.

| File | Purpose | Key function |
|------|---------|-------------|
| `moss.ts` | Semantic search for procurement facts | `searchProcurementIntel(query)` |
| `supermemory.ts` | Persistent supplier + language memory | `getSupplierMemory()`, `storeNegotiationMemory()` |
| `browseruse.ts` | Pre-call web research on supplier | `researchSupplier(url)` |
| `agentmail.ts` | Transactional email (quotes + confirmations) | `sendQuoteEmail()`, `sendConfirmation()` |
| `sponge.ts` | Payment execution to supplier wallets | `executePayment()` |
| `stripe.ts` | Payment links for buyer settlement | `createPaymentLink()` |

**Adding a new sponsor:** create `lib/sponsors/<name>.ts`, add API key to `lib/env.ts`, wrap all calls in try/catch, log via `lib/logger.ts`.

### Infrastructure

| File | Role |
|------|------|
| `lib/db.ts` | Supabase client + 30+ query helpers (preferred over root `lib/db.ts`) |
| `lib/encryption.ts` | AES-256-GCM floor price encryption/decryption |
| `lib/env.ts` | Zod schema for all 39 env vars — validates at startup |
| `lib/logger.ts` | Structured logging |
| `lib/socket.ts` | Socket.io server for real-time dashboard events |
| `lib/authMiddleware.ts` | Session validation — apply to every API route |
| `lib/vapi.ts` | Vapi API client wrapper |
| `lib/khaya.ts` | Khaya TTS/ASR wrapper (West African languages) |
| `lib/deepgram.ts` | Deepgram STT (alternative/fallback) |

---

## Opus Injector — How It Works

`lib/opusInjector.ts` is the key differentiator. Understand this before touching anything in the call pipeline.

1. During a live Gemini voice session, supplier transcripts stream in.
2. `shouldTrigger(transcript)` (`lib/triggerDetection.ts`) detects factual claims or price anchors.
3. 2.5s debounce waits for supplier to finish speaking.
4. Opus is called with:
   - Supplier's claim
   - Moss results (market facts for the part/region)
   - Supermemory context (supplier's history, prior quotes)
   - Current RFQ terms (decrypted floor price included)
5. Opus returns a rebuttal/counterpoint.
6. Rebuttal is injected into Gemini Live session — invisible to supplier.
7. Injection latency, Opus response, Moss results stored in `reasoning_traces`.
8. 30s per-session cooldown prevents spam injection.
9. 4s Opus timeout — if exceeded, skip injection (don't block the call).

**Don't change:** debounce/cooldown/timeout values without understanding call flow. Changing these affects negotiation quality in production.

---

## Workers

### `workers/callWorker.ts`
- Polls `CallQueue` every 500ms.
- Dequeues entry → creates Vapi assistant (with dynamic system prompt) → initiates outbound call.
- Handles call lifecycle: ringing → connected → in-progress → ended.
- On failure: retries up to configured max, marks call failed in DB.

### `workers/rlWorker.ts`
- Monitors `feedback` table for new buyer outcomes.
- Calls `lib/patternExtraction.ts` to extract negotiation patterns.
- Updates `dialect_configs` rows (aggressiveness, pacing, opening_style) based on win rate.
- Runs on a schedule or triggered via `app/api/rl/route.ts`.

---

## Components

| Component | Purpose |
|-----------|---------|
| `components/RFQWizard.tsx` | Multi-step RFQ creation form |
| `components/ResultsTable.tsx` | Calls + scores + ranking table |
| `components/LiveTranscriptPanel.tsx` | Real-time call transcript display |
| `components/ReasoningTracePanel.tsx` | Opus injection traces (debug view) |
| `components/SupplierImport.tsx` | CSV import for bulk supplier upload |

---

## Vapi Webhook — `finalizeCall()`

Called by `app/api/vapi/webhook/route.ts` when Vapi reports call-end.

Sequence:
1. Receive Vapi call-end event.
2. Fetch full transcript from Vapi.
3. Call `aggregator.ts` (Haiku) → extract structured terms.
4. Store in `calls` table (quoted_price, lead_time_days, scores).
5. Store transcripts in `call_transcripts`.
6. Send emails via AgentMail.
7. Store negotiation memory via Supermemory.
8. Trigger payment if auto-pay configured (Sponge).
9. Emit `negotiation_result` event via Socket.io.

---

## Custom Voice Endpoint — `app/api/vapi/voice/route.ts`

Vapi calls this for TTS when Khaya is configured as the voice.

Flow:
1. Receive text from Vapi.
2. POST to Khaya API for synthesis.
3. Strip WAV header from audio.
4. Resample: Khaya output → Vapi-compatible PCM (see `server/audio.ts` for codec helpers).
5. Return raw PCM bytes with correct content-type.

---

## Scoring Logic

`lib/scoring.ts` computes composite score per supplier call:

- **Price score**: `(target_price - quoted_price) / target_price` normalized
- **Lead time score**: inverse of lead_time_days (faster = better)
- **Quality score**: derived from certifications + communication patterns
- **Composite**: weighted sum (weights configurable per RFQ)
- `recommended` flag set on highest composite score

---

## What NOT to Do

- Don't use root `lib/db.ts` for new code — use `haggl/lib/db.ts`.
- Don't call Supabase client directly in API routes — use query helpers.
- Don't expose `floor_price_enc` or decrypted floor price in API responses.
- Don't bypass `authMiddleware` on any route.
- Don't swallow errors in sponsor integrations silently — log them.
- Don't change Opus debounce/cooldown/timeout without understanding call quality impact.
- Don't add logic to `workers/` that belongs in `lib/` — workers are orchestration only.
