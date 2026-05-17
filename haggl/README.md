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

## Compliance

- AI disclosure at start of every call
- Floor price never revealed
- Hard 8-minute call cap
- Twilio concurrency respected
