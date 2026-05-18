# CLAUDE.md — web/ (Atlas Dashboard)

> See root `../CLAUDE.md` for project overview, tech stack, security rules, and agent routing.
> See `HANDOFF.md` (same directory) for the backend integration checklist.

## What This Is

The Atlas dashboard — a Next.js 15 frontend for live procurement monitoring. Shows real-time call ledger, KPIs, transcripts, and best-offer banner. Currently ships with a **simulator** for demo; backend wiring is the pending integration step (see HANDOFF.md).

---

## State Architecture — Zustand + Event Reducer

**All state flows through one reducer.** This is the core invariant. Never bypass it.

```
Backend / Simulator
       ↓
ingestEvent(LiveCallEvent)     ← single entry point
       ↓
useAtlas Zustand store          ← state machine
       ↓
selectors.ts                    ← memoized derived views
       ↓
Components                      ← read-only consumers
```

### Key files

| File | Role |
|------|------|
| `lib/store/index.ts` | `useAtlas` Zustand store + `ingestEvent()` reducer |
| `lib/store/selectors.ts` | Memoized derived views: KPIs, best offer, ledger rows |
| `lib/store/store-hydrator.tsx` | Entry point — imports simulator OR realtime bridge (swap here) |
| `lib/data/simulator.ts` | Mock data + clock for demo (generates `LiveCallEvent` stream) |
| `lib/data/realtime.ts` | STUB: WebSocket bridge to backend (implement for production) |
| `lib/data/seed.ts` | 6 mock suppliers for demo |
| `lib/data/transcript-script.ts` | Mock transcript sequences (demo only) |

### Allowed patterns

```ts
// ✅ Read state via selector
const bestOffer = useAtlas(selectBestOffer);

// ✅ Drive state via event
useAtlas.getState().ingestEvent({ type: 'negotiation_result', ... });

// ✅ Add derived view in selectors.ts
export const selectSavingsKPI = (state: AtlasState) => ...
```

### Forbidden patterns

```ts
// ❌ Never mutate store directly from a component
useAtlas.setState({ calls: [...] });

// ❌ Never derive data inside a component — use/add a selector
const savings = calls.reduce((sum, c) => sum + c.delta, 0); // in component

// ❌ Never import simulator in production code path
import { simulator } from '../data/simulator'; // outside store-hydrator
```

---

## LiveCallEvent Contract

The store reducer handles these event types:

```ts
type LiveCallEvent =
  | { type: 'call_initiated';       call_id, rfq_id, supplier_id, timestamp }
  | { type: 'call_ringing';         call_id, timestamp }
  | { type: 'call_connected';       call_id, timestamp }
  | { type: 'transcript_delta';     call_id, role: 'agent'|'supplier', content, timestamp }
  | { type: 'opus_analysis';        call_id, reasoning, injected: boolean, latency_ms }
  | { type: 'negotiation_result';   call_id, quoted_price, lead_time_days, scores, recommended }
  | { type: 'call_capped';          call_id, reason }
  | { type: 'call_failed';          call_id, error }
  | { type: 'campaign_complete';    rfq_id, summary }
```

When adding new backend events: add the type here, update `ingestEvent()` in `lib/store/index.ts`, add a selector in `selectors.ts` if derived state is needed.

---

## Simulator ↔ Realtime Swap

`lib/store/store-hydrator.tsx` has one import to swap:

```ts
// Demo mode (default):
import { startSimulator } from '../data/simulator';

// Production mode (swap to):
import { startRealtimeBridge } from '../data/realtime';
```

Both exports have the same signature: `() => () => void` (start → returns cleanup). Zero component changes required.

**To implement production bridge in `lib/data/realtime.ts`:**
1. Open WebSocket to `process.env.NEXT_PUBLIC_WS_URL`.
2. On each message: parse as `LiveCallEvent`, call `useAtlas.getState().ingestEvent(event)`.
3. Return cleanup function that closes the socket.

---

## Auth Swap Layer

`lib/auth/` has three files with inline swap comments:

| File | Current | Production swap |
|------|---------|----------------|
| `mock-auth.ts` | Mock cookie-based signIn/signOut | Replace with Supabase client calls |
| `index.ts` | Mock `getSession()` returns hardcoded user | Replace with `supabase.auth.getSession()` |
| `constants.ts` | Shared (no swap needed) | — |

---

## Routes

```
app/
  (auth)/
    login/          # Auth entry — swap mock-auth.ts for real auth
    onboarding/     # RFQ wizard: product, budget, units, regions, languages
  (app)/            # Protected routes (session required)
    dashboard/      # Live call ledger + KPI bar
    calls/[id]/     # Call detail: transcript + reasoning traces
    suppliers/      # Supplier list
  api/
    chat/route.ts   # Gemini planning chat agent
  page.tsx          # Redirects to dashboard or login
```

---

## Components

| Component | Purpose |
|-----------|---------|
| `components/dashboard-view.tsx` | Call ledger grid + KPI bar |
| `components/chat-panel.tsx` | Gemini planning chat |
| `components/onboarding-flow.tsx` | RFQ wizard (product, budget, regions, languages) |
| `components/best-offer-banner.tsx` | Highlight best deal + "Lock deal" action |
| `components/ledger-row-detail.tsx` | Expanded call: transcript + Opus traces |
| `components/procureai/` | Brand components (logo, typography) |

---

## Adding Features

### New KPI or derived view
1. Add selector to `lib/store/selectors.ts`.
2. Consume in component via `useAtlas(selectMyKPI)`.
3. Never compute in the component.

### New event type from backend
1. Add to `LiveCallEvent` union in `lib/types.ts`.
2. Add case in `ingestEvent()` in `lib/store/index.ts`.
3. If simulator should emit it, add to `lib/data/simulator.ts`.
4. If it drives a new derived view, add selector.

### New page/route
1. Create under `app/(app)/` (protected) or `app/(auth)/` (public).
2. Use `getSession()` from `lib/auth/index.ts` for auth check.
3. Read state only via `useAtlas` + selectors — no local state for data that belongs in store.

---

## What NOT to Do

- Don't add local state (`useState`) for data that should be in the Zustand store.
- Don't import `simulator` outside `store-hydrator.tsx`.
- Don't add API calls directly in components — put them in `lib/data/realtime.ts` or a dedicated lib file.
- Don't add new auth logic — extend `lib/auth/mock-auth.ts` and swap to Supabase when ready.
- Don't hardcode supplier data in components — use `lib/data/seed.ts` or store.
- Don't duplicate derived logic already in `selectors.ts`.
