# haggl

**Negotiate in any language.**

haggl is a voice-AI agent that calls overseas suppliers on your behalf,
speaks their language, negotiates the deal, and reports back. Built for
buyers who can't reach manufacturers directly because of a language wall.

Currently supports **Yoruba**, **Twi**, and **Hindi** — covering supplier
hubs in Nigeria, Ghana, and India.

---

## The problem

US buyers sourcing directly from overseas manufacturers (textiles,
footwear, spices, electronics) hit the same wall: the supplier's English
is limited, the buyer's Yoruba / Twi / Hindi is nonexistent, and the deal
dies on a WhatsApp voice note nobody can parse. Big companies solve this
with on-the-ground sourcing agents. Everyone else gets stuck.

## What haggl does

1. User tells haggl what they're sourcing, budget, and priorities.
2. haggl researches and shortlists suppliers, then drafts a sourcing plan
   the user can edit.
3. User approves. haggl places parallel outbound voice calls — each one
   in the supplier's native language.
4. The agent negotiates in real time, holds the buyer's price cap, and
   surfaces the best offer.
5. User locks the deal.

---

## How it works

Three swappable layers, orchestrated by AgentPhone:

- **Telephony + agent runtime** — AgentPhone handles PSTN, turn-taking, and
  the call lifecycle.
- **Transcription** — Khaya AI for Yoruba and Twi (the languages other STT
  providers don't cover well), Deepgram for Hindi, plumbed through a
  custom WebSocket bridge.
- **Voice synthesis** — handled through AgentPhone's voice runtime for
  response audio.

The planning brain is **Gemini**, called from a Next.js API route. The
negotiation engine, call workers, and an RL feedback loop live in `haggl/`.
The user-facing frontend (`web/`) is a Next.js 15 app with a
dashboard-forward layout: stat cards across the top, a live ledger of
in-flight calls, and a chat panel that drives the planning step.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Frontend   │───▶│   Gemini    │    │  Khaya AI   │
│  Next.js 15 │    │  (planning) │    │ (Yoruba/Twi)│
└──────┬──────┘    └─────────────┘    └──────▲──────┘
       │                                     │
       │ start campaign                      │ audio stream
       ▼                                     │
┌─────────────┐    ┌─────────────┐    ┌──────┴──────┐
│ AgentPhone  │───▶│  Outbound   │───▶│  WebSocket  │
│ (telephony) │    │   calls     │    │   bridge    │
└─────────────┘    └─────────────┘    └─────────────┘
```

---

## Quick start

The demo flow runs in `web/` (Atlas UI). The full telephony backend
(call workers, negotiation engine, Supabase) lives in `haggl/`.

**Frontend — the demo:**
```bash
git clone <repo>
cd <repo>/web
npm install
cp .env.example .env.local   # add GEMINI_API_KEY
npm run dev                  # http://localhost:3100
```

**Backend — telephony + negotiation:**
```bash
cd <repo>/haggl
npm install
cp .env.example .env.local   # fill in keys
npm run dev:all              # Next.js (:3000) + WS bridge
```

### Key environment variables

| Variable | Purpose | Where |
|---|---|---|
| `GEMINI_API_KEY` | Planning agent | `web/`, `haggl/` |
| `VAPI_API_KEY` | Telephony + voice agent runtime | `haggl/` |
| `KHAYA_API_KEY` | Yoruba / Twi transcription | `haggl/` |
| `DEEPGRAM_API_KEY` | Hindi transcription | `haggl/` |
| `SUPABASE_*` | Persistence (calls, deals, RFQs) | `haggl/` |

See each app's `.env.example` for the full list.

---

## Project structure

```
.
├── web/                 # Next.js 15 frontend (Atlas UI) — the demo
│   ├── app/             # auth, onboarding, planning, plan, dashboard
│   ├── lib/store/       # Zustand store + event reducer
│   ├── lib/data/        # simulator + realtime bridge
│   └── HANDOFF.md       # backend integration points
├── haggl/               # Telephony backend + procurement dashboard
│   ├── app/api/         # Vapi, research, calls, demo seed routes
│   ├── lib/             # negotiation engine, Khaya, Vapi, sponsors
│   ├── workers/         # callWorker, rlWorker, WS bridge
│   └── cron/            # scheduled RL runs
└── server/              # early Twilio audio prototype
```

For wiring real call data into the dashboard, see
[`web/HANDOFF.md`](web/HANDOFF.md). For backend deployment, see
[`haggl/DEPLOYMENT.md`](haggl/DEPLOYMENT.md).

---

## Demo

1. Sign in.
2. Five-step onboarding — product, budget, regions, languages, priority.
3. Planning loader — Gemini drafts a sourcing plan.
4. Plan canvas — review, refine through chat, approve.
5. Dashboard — watch parallel calls land, deals roll in.

Mock data simulates calls when real telephony isn't wired up.

---

## Status

Built at the **YC × AgentPhone "Call My Agent" hackathon** (May 2026).

Known limitations:
- Yoruba TTS carries an English accent — a Nigerian-native voice provider
  would fix this in production.
- Supplier research uses a curated seed list; broader live scraping is on
  the roadmap.
- "Lock deal" wires to UI state only; production wiring (order creation,
  payment) is next.

---

## License

MIT
