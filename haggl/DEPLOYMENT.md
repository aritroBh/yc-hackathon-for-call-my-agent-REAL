# HAGGL Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Next.js (Port 3000)               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │   Pages      │  │   API Routes │  │ Dashboard   │  │
│  │  + Components│  │  + Auth       │  │ Realtime    │  │
│  └─────────────┘  └──────┬───────┘  └─────┬──────┘  │
├──────────────────────────┼────────────────┼─────────┤
│                    Express WS Bridge (Port 3001)       │
│  ┌──────────────────────┴────────────────┐            │
│  │  Twilio Media Streams ◄──► Deepgram    │            │
│  │  Session Manager + Socket.io           │            │
│  └──────────────────────┬────────────────┘            │
├─────────────────────────┼────────────────────────────┤
│                    Supabase (Postgres)                 │
│  ┌──────────────────────┴────────────────┐            │
│  │  Organizations | RFQs | Suppliers      │            │
│  │  Calls | Feedback | Configs | Traces   │            │
│  └─────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 20+
- npm 9+
- Supabase project (free tier works)
- Twilio account with Programmable Voice
- Deepgram API key (Voice Agent access)
- Anthropic API key (Claude)

## Quick Start (Local Dev)

```bash
# 1. Install deps
npm ci

# 2. Copy env
cp .env.example .env.local
# Fill in all values (see Configuration below)

# 3. Deploy database schema
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql

# 4. Start dev (Next.js + WS bridge)
npm run dev:all

# 5. Seed demo data
npm run seed:demo

# 6. Expose webhooks (separate terminal)
ngrok http 3000
# Set TWILIO_WEBHOOK_BASE to your ngrok URL
```

## Configuration

### Required Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Supabase Dashboard → Settings → API |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Twilio Console |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Twilio Console |
| `TWILIO_PHONE_NUMBER` | Outbound caller ID | Twilio Console → Phone Numbers |
| `TWILIO_WEBHOOK_BASE` | Public URL for webhooks | Your ngrok/domain URL |
| `DEEPGRAM_API_KEY` | Deepgram API key | Deepgram Console |
| `ANTHROPIC_API_KEY` | Claude API key | Anthropic Console |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes) | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SENTRY_DSN` | - | Sentry error tracking |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `fatal` |
| `ENABLE_AUTH` | `true` | Set `false` for dev without auth |
| `DEMO_MODE` | `false` | Bypasses auth, enables demo data |
| `MAX_CONCURRENT_CALLS` | `8` | Parallel call limit |
| `CALLS_PER_SECOND` | `1` | Twilio rate limit |
| `HAGGL_DATA_DIR` | `./data` | Queue persistence directory |
| `REDIS_URL` | - | Optional Redis for queue |

## Deployment Options

### 1. Docker (Recommended for Production)

```bash
# Build
docker build -t haggl .

# Run with env file
docker run -d \
  --name haggl \
  -p 3000:3000 -p 3001:3001 \
  --env-file .env.production \
  -v haggl_data:/data \
  haggl

# Or use docker-compose
docker compose up -d
```

**Health check:** `curl http://localhost:3000/api/health`

### 2. Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. Create a new project from this repo
2. Set all environment variables in Railway Dashboard
3. Railway auto-detects `railway.json` and `Dockerfile`
4. Deploy triggers on push to main

**Post-deploy:** Run `npm run seed:demo` in Railway shell.

### 3. Vercel (Frontend + API only)

> **Note:** Vercel does not support WebSocket servers. The Express WS bridge must run separately.

```bash
# 1. Deploy Next.js to Vercel
npx vercel --prod

# 2. Set env vars in Vercel Dashboard
# 3. Deploy WS bridge separately (Railway, Fly.io, or EC2)
```

**WS bridge standalone deployment:**
```bash
# On a VM or container that supports WebSocket
node workers/express-bridge.mjs
```

Set `NEXT_PUBLIC_WS_URL` to the bridge's public URL.

### 4. Manual (VPS / EC2)

```bash
# Build
npm run build

# Run Next.js
npm start -- -p 3000 &

# Run WS bridge
node workers/express-bridge.mjs &

# Run worker
npx tsx workers/callWorker.ts &

# Set up cron for RL pipeline
node cron/schedule.js install
```

## Supabase Setup

### Create Project
1. Go to [supabase.com](https://supabase.com) → New project
2. Note your project URL, anon key, and service role key
3. Enable Row Level Security (RLS)

### Deploy Schema
```bash
# Direct connection
psql "$DATABASE_URL" -f db/schema.sql

# Or use Supabase SQL Editor — paste contents of db/schema.sql
```

### Apply Seed Data
```bash
psql "$DATABASE_URL" -f db/seed.sql
```

### Create Demo Organization
```sql
INSERT INTO organizations (id, name, slug, settings)
VALUES (gen_random_uuid(), 'Demo Corp', 'demo-corp', '{"max_concurrent_calls": 8, "ai_disclosure_required": true}');
```

## Twilio Setup

### 1. Buy a Phone Number
- Twilio Console → Phone Numbers → Buy a Number
- Ensure it supports Voice (not just SMS)

### 2. Configure Webhook URLs
- Phone Numbers → Manage → Active Numbers → Your Number
- Set **Voice Configuration**:
  - Accept Incoming: `Voice Calls`
  - **When a call comes in:** `https://your-domain.com/api/calls/stream`
  - If you use the disclosure flow, point to your webhook base

### 3. Set Status Callback
- This is handled at call creation time via `statusCallback` parameter
- Ensure `TWILIO_WEBHOOK_BASE` points to your public URL

### 4. TwiML Bing Configuration (optional)
- For AI-powered Bing, use Polly voices (e.g., `Polly.Joanna-Neural`)
- Already configured in `lib/twilio.ts`

## Deepgram Setup

### 1. Create API Key
- Deepgram Console → API Keys → Create Key
- Ensure Voice Agent access is enabled

### 2. Configure Voice Agent Settings
- The system uses `nova-2-phonecall` for ASR (listen)
- `gemini-2.5-flash` via Deepgram Google provider (think)
- `aura-2-odysseus-en` for TTS (speak)
- These are configured in `lib/deepgram.ts`

### 3. Verify API Access
```bash
curl -X GET "https://api.deepgram.com/v1/projects" \
  -H "Authorization: Token YOUR_DEEPGRAM_API_KEY"
```

## Anthropic Setup

### 1. Get API Key
- Go to [console.anthropic.com](https://console.anthropic.com) → API Keys
- Create a key with Claude access

### 2. Usage Breakdown

| Component | Model | Purpose | Cost Tier |
|-----------|-------|---------|-----------|
| OpusInjector | `claude-opus-4-5-20250514` | Live rebuttal intelligence | High (triggered ~3-5x/call) |
| Aggregator | `claude-3-5-haiku-20241022` | Post-call transcript extraction | Low (1x/call) |
| Pattern Extraction | `claude-opus-4-5-20250514` | RL nightly batch analysis | High (1x/completed call) |

### 3. Estimate Monthly Cost
- 1000 calls/month × 5 Opus calls (triggered) = ~$30-50
- 1000 calls × 1 Haiku extraction = ~$0.50-1
- 30 nightly batches × 33 calls/batch × 1 Opus = ~$10-20
- **Total estimate:** $40-70/month at moderate volume

## Monitoring

### Health Check
```bash
curl http://your-domain.com/api/health
```
Returns JSON with database status, service health, and queue size.

### Logs (Docker)
```bash
docker logs -f haggl
docker logs haggl | grep '"level":"error"'
```

### Sentry (if configured)
- All `logger.error()` and `logger.fatal()` calls send to Sentry
- Includes callId, rfqId, requestId tags

### Key Metrics
| Metric | Where | What to Watch |
|--------|-------|---------------|
| Call success rate | API / DB | ≥ 80% success |
| Average call duration | Dashboard | ~3-5 min target |
| Opus injection rate | Logs | ≤ 5/call |
| Queue depth | Health API | Should drain to 0 |
| RL savings | Dashboard | Increasing trend |

## Production Runbook

### Backup Queue State
```bash
cp /data/queue.json /data/queue.json.$(date +%Y%m%d)
```

### Restart Services
```bash
# Docker
docker compose restart

# Manual
kill $(pgrep -f "next start")
kill $(pgrep -f "express-bridge")
kill $(pgrep -f "callWorker")
npm start &
node workers/express-bridge.mjs &
npx tsx workers/callWorker.ts &
```

### Rollback
```bash
# Railway / Vercel: Redeploy previous version
# Docker: Tag previous image
docker run haggl:previous
```

### Scale Up
1. Increase `MAX_CONCURRENT_CALLS` (respect Twilio limits)
2. Add more call workers if queue backs up
3. Monitor Deepgram WS connections (concurrent session limit)
4. Consider Redis for queue persistence at scale

## Debugging

### WebSocket Connection Issues
- Verify port 3001 is reachable
- Check `NEXT_PUBLIC_WS_URL` matches bridge URL
- Look for `Socket connect error` in logs

### Twilio Call Failures
- Verify `TWILIO_WEBHOOK_BASE` is public + valid TLS
- Check webhook is reachable: `curl -v https://your-domain.com/api/calls/stream`
- Verify Twilio phone number has voice capabilities

### Deepgram Connection Issues
- Check API key in Deepgram console
- Verify WS URL: `wss://agent.deepgram.com/v1/agent/converse`
- Look for `RECONNECT_EXHAUSTED` in logs

### TypeScript / Build Issues
```bash
npm run typecheck  # TypeScript check
npm run lint       # ESLint
npm run build      # Full build
```

## Security Notes

- `ENCRYPTION_KEY` must be 64 hex characters (32 bytes) — generate with `crypto.randomBytes(32).toString('hex')`
- Floor prices are AES-256-GCM encrypted at rest; decrypted only in server context
- Supabase RLS policies protect tenant isolation
- Auth middleware validates JWT on every API call; bypass with `ENABLE_AUTH=false` for dev only
- Rate limiting: 60 req/min per IP globally, 1 call/s to Twilio
- Circuit breaker opens after 5 consecutive failures (30s reset)
- All API errors return structured `{ error, details? }` JSON — never stack traces
