# HAGGL

AI-powered procurement negotiation platform.

Dispatches parallel outbound voice agents to suppliers, negotiates pricing
and terms via Deepgram Voice Agent (Gemini), analyzes outcomes with Claude
Opus, and ranks suppliers by multi-factor score.

## Stack

| Concern     | Choice                      |
|-------------|-----------------------------|
| Frontend    | Next.js 14 App Router + TS  |
| Styling     | Tailwind CSS                |
| Database    | Supabase (Postgres)         |
| Voice       | Deepgram Voice Agent WS     |
| LLM (call)  | Gemini 2.5 Flash            |
| LLM (analy) | Claude Opus                 |
| Telephony   | Twilio Programmable Voice   |
| Realtime    | Socket.io + WebSocket       |
| Auth        | Supabase Auth               |

## Quick start

```bash
cp .env.example .env.local   # fill in real keys
npm install
npm run dev:all              # Next.js + Express WS bridge
```

## Scripts

| Command          | Action                        |
|------------------|-------------------------------|
| `npm run dev`    | Next.js dev server :3000      |
| `npm run build`  | Production build              |
| `npm run lint`   | ESLint                        |
| `npm run typecheck` | tsc --noEmit              |
| `npm run server` | Express WS bridge :3001       |
| `npm run dev:all`| Both servers concurrently     |
| `npm run db:migrate` | Run migrations           |
| `npm run db:seed`| Seed data                     |

## Architecture

```
RFQ → Supplier import → Parallel dispatch → Twilio calls
  → Express WS bridge → Deepgram Voice Agent (Gemini)
  → Transcript streamed via Socket.io → Result saved
  → Claude Opus analysis → Multi-factor ranking → Dashboard
```

- AI disclosure at start of every call
- Floor price never revealed
- Hard 8-minute call cap
- Twilio concurrency respected

## New Production Hardening Features

### 1. Serverless Readiness & Real-Time Telemetry
- **Socket-Driven State Updates**: Replaced resource-heavy polling with efficient WebSocket (`Socket.io`) events to push real-time call states (`call_status_changed`) to the monitor dashboard instantly.
- **Idempotent Outbound Dispatching**: Integrated strict UI locks and backend conflict validation to prevent duplicate dispatches (handling HTTP 409 responses), maintaining high database integrity.

### 2. High-Trust Observability & Intelligence Persistence
- **Persistent Reasoning Traces**: Configured `OpusInjector` to save Claude-based live intelligence injections to a dedicated `reasoning_traces` table. Live-streamed traces are also routed via WebSockets to the `ReasoningTracePanel` in real time.
- **Null-Value Graceful Degradation**: Refactored the dashboard `ResultsTable` with comprehensive fallbacks (handling missing quotes, failed extractions, and zero-score outliers with warning badges/tooltips) to maintain UI stability under all circumstances.

### 3. cost-Tracking Infrastructure
- **Telephony & LLM Cost Audit**: Persists the real financial cost (`cost_millicents` and `duration_seconds`) of every outbound call upon completion by integrating the Twilio billing REST API and accounting for Gemini/Claude token metrics.

### 4. Reinforced Learning (RL) Closed-Loop Pipeline
- **Continuous Prompt Optimization**: Implemented the `POST /api/rl/run` endpoint to run a periodic RL cycle. Completed calls are processed to extract negotiation patterns and regional idioms. The learned insights are used to optimize prompt templates in `dialect_configs` to refine future agent conversations dynamically.
- **One-Click Demo Route**: Added the `POST /api/demo/seed` endpoint to instantly seed sample RFQs, completed calls (with costs), reasoning traces, and feedback to demonstrate the entire platform's features locally.

