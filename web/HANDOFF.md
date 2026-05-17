# Atlas Web UI - Backend Integration Handoff

The frontend is **done and isolated**. This doc tells backend engineers exactly
where to plug in voice, call data, auth, and persistence. Nothing here touches
the existing `haggl` app - Atlas is a standalone Next.js 15 app in `web/`.

```
cd web && npm run dev      # http://localhost:3100
```

---

## 1. The big picture

Atlas is **dashboard-forward**. A buyer chats with a planning agent, kicks off a
batch of supplier calls, and watches deals land on a live ledger.

Three independent integration surfaces:

| Surface | What it is today (mock) | Where the backend connects |
|---|---|---|
| **Live call/deal data** | `setInterval` simulator | One reducer: `ingestEvent(LiveCallEvent)` |
| **Chat planning agent** | Gemini via `/api/chat` | Already real; needs grounding + actions |
| **Auth + persistence** | cookie mock | `lib/auth/*`, onboarding + action endpoints |

**Golden rule:** the UI never mutates call state directly. Every live update -
mock or real - flows through a single function: `useAtlas.getState().ingestEvent(event)`.
Match the event shape and the entire dashboard updates itself.

---

## 2. Data contract (read this first)

All shapes live in [`web/lib/types.ts`](lib/types.ts) and are copied **verbatim**
from `haggl/types/index.ts`. Keep them in sync - this is the contract.

Key types: `Supplier`, `NegotiationCall`, `TranscriptEntry`, `NegotiationResult`,
`RFQ`, `AggregatedResults`, `CallStatus`, `NegotiationPhase`, and the realtime
envelope **`LiveCallEvent`**:

```ts
interface LiveCallEvent {
  type: "call_initiated" | "call_ringing" | "call_connected"
      | "call_disconnected" | "call_failed" | "transcript_delta"
      | "agent_speaking" | "supplier_speaking" | "negotiation_phase_change"
      | "negotiation_result" | "call_capped" | "opus_analysis";
  call_id: string;
  rfq_id: string;
  supplier_id: string;
  timestamp: string;        // ISO
  data: Record<string, unknown>;   // per-type payload (below)
}
```

---

## 3. Voice / call data - the main integration point

### Where
- **Swap file:** [`web/lib/store/store-hydrator.tsx`](lib/store/store-hydrator.tsx)
  - change ONE import:
  ```ts
  // import { startSimulator } from "@/lib/data/simulator";
  import { startRealtimeBridge as startSimulator } from "@/lib/data/realtime";
  ```
- **Implement:** [`web/lib/data/realtime.ts`](lib/data/realtime.ts) (stub with the
  exact signature `() => cleanup` and an example WebSocket wiring in comments).
- **Reducer being fed:** [`web/lib/store/index.ts`](lib/store/index.ts) →
  `ingestEvent`. Read this switch to see exactly what each event must carry.

### Event → UI mapping (the `data` payload per `type`)

| `type` | `data` fields the UI needs | Effect |
|---|---|---|
| `call_initiated` | - | call → `queued` |
| `call_ringing` | - | call → `ringing` (Now-calling strip) |
| `call_connected` | - | call → `in-progress`, phase `greeting`, sets `started_at` |
| `negotiation_phase_change` | `{ phase: NegotiationPhase }` | updates phase chip |
| `transcript_delta` | `{ role:"agent"\|"supplier", content, translation_en?, language? }` | appends a `TranscriptEntry` (shown in expanded row, translated) |
| `negotiation_result` | `{ result: NegotiationResult }` | call → `completed`; recomputes best offer; posts agent chat status |
| `call_capped` | `{ reason: string }` | call → `capped` (over price cap) |
| `call_failed` / `call_disconnected` | `{ status?: CallStatus }` | terminal failure state |
| `agent_speaking` / `supplier_speaking` / `opus_analysis` | (free) | **currently no-op - available** for live talk indicator / reasoning trace |

### Elapsed time & cost
`ingestEvent` does not advance the clock. The bridge should call
`useAtlas.getState().tick(deltaSeconds)` on an interval (the simulator calls it
every 300ms). Cost is currently a mock rate (`COST_PER_CALL_MINUTE` in the store)
- replace with real per-call cost from your telephony provider, ideally via a
field on `negotiation_result`/`call_*` events.

### Seed data (replace)
[`web/lib/data/seed.ts`](lib/data/seed.ts) hardcodes the 6 demo suppliers, the
RFQ, and blank calls. In production these come from the dispatch response -
populate `useAtlas` initial state (or a first `ingestEvent` burst) from the real
RFQ + scraped supplier list. [`transcript-script.ts`](lib/data/transcript-script.ts)
is **mock-only**; delete once real `transcript_delta` events flow.

---

## 4. Actions that need real endpoints

These UI controls currently only drive local state. Wire each to your API:

| UI control | File | Today | Needs |
|---|---|---|---|
| **"Start calling N suppliers"** | `beginCampaign()` in [store/index.ts](lib/store/index.ts); buttons in `chat-panel.tsx` & `dashboard/_components/dashboard-view.tsx` | flips `callingStarted`, starts simulator | **POST to dispatch** → actually place the outbound voice calls (Vapi/Twilio batch). This is the real "go". |
| **"Lock this deal" / "Lock deal"** | `best-offer-banner.tsx`, `ledger-row-detail.tsx` | no-op | endpoint to accept an offer → order creation, AgentMail confirmation, Sponge payout, etc. |
| **"Pause all" / "Resume all"** | `togglePauseAll()` (Topbar) | pauses simulator clock | actually pause/cancel in-flight calls |
| **Onboarding answers** | `onboarding-flow.tsx` (`OnboardingAnswers`) | local state; only sets an `onboarded` cookie via `markOnboarded()` | **persist + create the RFQ/campaign** (product, budget cap, units, regions, languages, priority). This is the input to dispatch. Not sent anywhere yet. |
| **Sign out** | `sidebar.tsx` → `signOut()` | clears mock cookies | Supabase sign-out |

---

## 5. Auth

Mock seam, ready to swap to Supabase (`@supabase/ssr` already in the repo's other app):

- **Server gate:** [`web/lib/auth/index.ts`](lib/auth/index.ts) `getSession()` /
  `hasOnboarded()` - read a cookie. Replace with a Supabase server client.
  Used by `app/page.tsx`, `app/(app)/layout.tsx`, `app/(auth)/login|onboarding`.
- **Client:** [`web/lib/auth/mock-auth.ts`](lib/auth/mock-auth.ts) `signIn` /
  `signInWithGoogle` / `signOut` - swap for Supabase auth calls.
- **Shared constants/types:** [`web/lib/auth/constants.ts`](lib/auth/constants.ts)
  (kept directive-free on purpose - server + client both import it).

Route protection logic is unchanged when you swap; only these 3 files change.

---

## 6. Chat planning agent (`/api/chat`)

Already real. Server route: [`web/app/api/chat/route.ts`](app/api/chat/route.ts),
Gemini via `@google/genai`.

- **Key:** server-only, `GEMINI_API_KEY` / `GEMINI_MODEL` in `web/.env.local`
  (gitignored). Never exposed to the client. See [`.env.example`](.env.example).
- **Context Gemini gets today:** a static system prompt + the chat transcript
  (last 20 messages). It is **not** grounded in real call/deal/onboarding data -
  it infers from the agent status lines the store injects into the transcript.
- **Backend TODO (recommended):**
  1. Inject a live state summary (onboarding answers + per-supplier status + best
     offer) into the system prompt / a context message so replies are grounded.
  2. Give the agent **tool/function calling** so the chat can actually create the
     RFQ and trigger dispatch (instead of the separate "Start calling" button).
  3. The `READY_TO_CALL` token the model emits is the current hook for "agent has
     enough context to start calling" - replace with a structured tool call.

---

## 7. State & selectors (how the dashboard reads data)

- Store: [`web/lib/store/index.ts`](lib/store/index.ts) - collections keyed by id,
  plus chat slice and campaign runtime flags.
- Derived/memoized views: [`web/lib/store/selectors.ts`](lib/store/selectors.ts)
  - `selectKpis`, `selectBestOffer`, `selectRegionRows`, `selectDonut`,
  `selectActiveCall`, `selectLedgerRows`. Every dashboard widget is a thin
  consumer of these - you do **not** need to touch components when wiring data;
  feed `ingestEvent` and selectors recompute.

---

## 8. Env vars

| Var | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | `web/.env.local` | chat agent (server only) |
| `GEMINI_MODEL` | `web/.env.local` | default `gemini-2.5-flash` |
| `NEXT_PUBLIC_WS_URL` (suggested) | `web/.env.local` | realtime bridge endpoint (see `realtime.ts`) |
| Supabase keys (when wired) | `web/.env.local` | auth swap |

---

## 9. TL;DR for backend

1. Implement `startRealtimeBridge()` in `lib/data/realtime.ts`, normalize your
   telephony/agent events into `LiveCallEvent`, push them to
   `useAtlas.getState().ingestEvent(...)`, call `tick()` on a timer, flip the
   import in `store-hydrator.tsx`. Dashboard goes live with zero component changes.
2. Add a dispatch endpoint and wire `beginCampaign()` + onboarding answers to it.
3. Add "Lock deal" + "Pause all" endpoints.
4. Swap the 3 auth files for Supabase.
5. (Optional but high-value) Ground the Gemini agent in real state + give it
   dispatch as a tool.
