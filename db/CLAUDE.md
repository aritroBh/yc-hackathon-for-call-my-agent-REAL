# CLAUDE.md — db/ (Database)

> See root `../CLAUDE.md` for project overview. See `../types/database.ts` for TypeScript interfaces.

## Schema Overview

8 tables in PostgreSQL (Supabase). All have RLS enabled.

```
dialect_configs          (regional language + cultural profiles)
    ↓ FK
suppliers                (vendor directory, reliability scores)
    ↓ M:M
rfqs ←→ rfq_suppliers    (procurement requests, encrypted floor price)
    ↓
calls                    (one row per supplier-call, scores, outcome)
    ↓
call_transcripts         (turn-by-turn dialogue)
reasoning_traces         (Opus injection log per call)
feedback                 (buyer outcome, used for RL)
```

---

## Table Contracts

### `dialect_configs`
Seeded at startup (see `seed.sql`). 10 profiles covering Twi, Akan, Yoruba, Hindi, English-GH, etc.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| language | text | e.g. "Twi", "Yoruba" |
| locale | text | e.g. "tw-GH", "yo-NG" |
| opening_style | text | casual \| formal \| relationship-first |
| pacing | text | direct \| gradual |
| code_switch_pattern | text | guidance for code-switching |
| aggressiveness | float | 0.0–1.0, updated by RL worker |
| cultural_notes | jsonb | additional dialect-specific guidance |

**RL worker updates `aggressiveness` and `pacing` based on win rate. Don't manually edit these in production.**

### `suppliers`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| org_id | uuid | FK → organization |
| name | text | |
| phone | text | E.164 format for Vapi |
| email | text | for AgentMail |
| dialect_config_id | uuid | FK → dialect_configs |
| reliability_score | float | 0.0–1.0 |
| past_deals | jsonb | history summary |
| created_at | timestamptz | |

### `rfqs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| org_id | uuid | FK |
| part_name | text | |
| specs | jsonb | flexible part specifications |
| quantity | int | |
| target_price | decimal | buyer's goal price |
| floor_price_enc | text | **AES-256-GCM encrypted** — never expose in API |
| aggressiveness | float | negotiation intensity override |
| priority | text | low \| normal \| high \| urgent |
| status | text | draft \| active \| completed \| cancelled |
| created_at | timestamptz | |

### `rfq_suppliers`
M:M join. `rfq_id` + `supplier_id` + `status` (pending \| called \| completed \| failed).

### `calls`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| rfq_id | uuid | FK |
| supplier_id | uuid | FK |
| vapi_call_id | text | Vapi's call identifier |
| status | text | initiated \| ringing \| connected \| completed \| failed |
| quoted_price | decimal | extracted by Haiku aggregator |
| lead_time_days | int | extracted by Haiku aggregator |
| price_score | float | computed by scoring.ts |
| communication_score | float | |
| composite_score | float | weighted final score |
| recommended | boolean | highest composite per RFQ |
| transcript | text | full transcript (also in call_transcripts) |
| certifications | jsonb | extracted certs |
| moq | int | minimum order quantity |
| started_at | timestamptz | |
| ended_at | timestamptz | |

### `call_transcripts`
Turn-by-turn. `call_id`, `role` (agent\|supplier), `content`, `timestamp`.

### `reasoning_traces`
One row per Opus injection attempt.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| call_id | uuid | FK |
| trigger_text | text | supplier utterance that fired injection |
| opus_response | jsonb | full Opus response |
| moss_results | jsonb | Moss search results used |
| injection_delay_ms | int | latency from trigger to injection |
| injected | boolean | false if Opus timed out or cooldown active |
| created_at | timestamptz | |

### `feedback`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| call_id | uuid | FK |
| actual_price | decimal | what buyer actually paid |
| price_delta_pct | float | (quoted - actual) / quoted |
| rl_processed | boolean | whether RL worker has consumed this |
| created_at | timestamptz | |

---

## RLS Policies

All tables restrict reads and writes to the owning `org_id` (or `user_id`). Pattern:

```sql
CREATE POLICY "org_isolation" ON calls
  USING (org_id = auth.jwt() ->> 'org_id');
```

**Rules:**
- Never bypass RLS with service-role key except in migrations or background workers that run outside request context.
- Background workers (rlWorker, callWorker) use service-role key — scope queries explicitly, don't rely on RLS.
- New tables must have RLS enabled and an `org_id` isolation policy before merging.

---

## Migrations

1. Write SQL in `db/` with numeric prefix: `002_add_column.sql`, `003_new_table.sql`.
2. Apply: `npm run db:migrate` from root.
3. Update `types/database.ts` TypeScript interfaces to match.
4. Update `haggl/lib/db.ts` query helpers if new columns needed.
5. If new table: add RLS policy in migration file, not separately.
6. Seed data goes in `db/seed.sql` — run with `npm run db:seed`.

---

## Query Helpers (`haggl/lib/db.ts`)

Use these. Never write raw Supabase queries in API routes.

Key helpers (non-exhaustive):
- `createRfq(rfq)` — encrypts floor_price, inserts row
- `listRfqs(orgId)` — returns RFQ[] for org
- `getRfqCalls(rfqId)` — calls with scores for an RFQ
- `listSuppliers(orgId)` — supplier list
- `upsertCall(call)` — insert or update call state
- `addTranscriptTurn(callId, role, content)` — append transcript row
- `storeReasoningTrace(trace)` — insert reasoning_traces row
- `storeFeedback(feedback)` — insert feedback row
- `getDialectConfig(id)` — fetch dialect profile
- `updateDialectConfig(id, patch)` — RL worker updates aggressiveness/pacing

**Adding a new helper:**
1. Define in `haggl/lib/db.ts`.
2. Add TypeScript return type using interfaces from `types/database.ts`.
3. Handle Supabase errors explicitly — return `null` or throw, don't swallow.

---

## Floor Price Encryption

`floor_price_enc` is AES-256-GCM encrypted using `ENCRYPTION_KEY` env var.

- Encrypt: `haggl/lib/encryption.ts` → `encryptFloorPrice(price)`
- Decrypt: `haggl/lib/encryption.ts` → `decryptFloorPrice(enc)`
- Only decrypt server-side, inside call pipeline (opusInjector, promptBuilder).
- Never return decrypted value in API responses.
- Never log the decrypted value.

---

## What NOT to Do

- Don't write raw Supabase queries in API routes or components.
- Don't add columns without updating `types/database.ts`.
- Don't create tables without RLS policies.
- Don't use service-role key in request-scoped code (API routes).
- Don't skip the numeric prefix on migration files.
- Don't manually edit `aggressiveness`/`pacing` in `dialect_configs` in production.
- Don't store unencrypted floor prices anywhere.
