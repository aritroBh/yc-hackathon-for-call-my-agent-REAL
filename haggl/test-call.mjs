#!/usr/bin/env node
/**
 * test-call.mjs — fire one real Twilio outbound call (no Vapi).
 *
 * Usage (from repo root):   node haggl/test-call.mjs
 * Usage (from haggl/ dir):  node test-call.mjs
 *
 * Prerequisites:
 *   1. node workers/express-bridge.mjs   (port 3001, serves /call/twiml + /call/stream)
 *   2. ngrok pointing to port 3001        (TWILIO_WEBHOOK_BASE must be the ngrok HTTPS URL)
 *
 * Flow: Twilio dials the number → hits /call/twiml → gets <Connect><Stream> →
 *       opens WS to /call/stream → bridge feeds audio to Gemini Live → Bengali agent talks.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env (last non-empty value wins for duplicate keys) ───────────────
function loadEnv() {
  const candidates = [
    resolve(__dir, "../.env"),
    resolve(process.cwd(), ".env"),
    resolve(__dir, ".env"),
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf8");
      const fileEnv = {};
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key) fileEnv[key] = val; // last non-empty wins within file
      }
      // Apply to process.env — shell env takes precedence over file
      for (const [key, val] of Object.entries(fileEnv)) {
        if (!process.env[key]) process.env[key] = val;
      }
      console.log(`[env] loaded from ${p}`);
      return;
    } catch { /* try next */ }
  }
  console.warn("[env] no .env file found — using shell environment");
}

loadEnv();

// ── Auto-detect ngrok if bridge is running ─────────────────────────────────
async function detectNgrokUrl() {
  try {
    const res = await fetch("http://localhost:4040/api/tunnels", {
      signal: AbortSignal.timeout(1500),
    });
    const data = await res.json();
    return data.tunnels?.find((t) => t.proto === "https")?.public_url || null;
  } catch {
    return null;
  }
}

// ── Config ──────────────────────────────────────────────────────────────────
const ACCOUNT_SID    = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN     = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER    = process.env.TWILIO_PHONE_NUMBER  || "+19255155725";
let   WEBHOOK_BASE   = process.env.TWILIO_WEBHOOK_BASE  || "";
const TEST_PHONE     = "+19259676242";
const LANG           = "bn";

if (!ACCOUNT_SID) { console.error("TWILIO_ACCOUNT_SID missing"); process.exit(1); }
if (!AUTH_TOKEN)  { console.error("TWILIO_AUTH_TOKEN missing");  process.exit(1); }

// Auto-detect ngrok tunnel (overrides .env TWILIO_WEBHOOK_BASE if localhost/empty)
if (!WEBHOOK_BASE || WEBHOOK_BASE.includes("localhost")) {
  const ngrokUrl = await detectNgrokUrl();
  if (ngrokUrl) {
    WEBHOOK_BASE = ngrokUrl;
    console.log(`[ngrok] auto-detected: ${ngrokUrl}`);
  }
}
if (!WEBHOOK_BASE) {
  console.error("TWILIO_WEBHOOK_BASE missing and ngrok not detected on port 4040");
  process.exit(1);
}

const hagglCallId = `test_bn_${Date.now()}`;
const twimlUrl = `${WEBHOOK_BASE}/call/twiml?hcid=${encodeURIComponent(hagglCallId)}&lang=${LANG}`;

console.log(`\n[test-call] hagglCallId:   ${hagglCallId}`);
console.log(`[test-call] calling:        ${TEST_PHONE}`);
console.log(`[test-call] from:           ${FROM_NUMBER}`);
console.log(`[test-call] twiml webhook:  ${twimlUrl}\n`);

// ── Twilio REST API — initiate outbound call ────────────────────────────────
const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
const body = new URLSearchParams({
  To:   TEST_PHONE,
  From: FROM_NUMBER,
  Url:  twimlUrl,
});

try {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    console.error("Twilio error:", JSON.stringify(data, null, 2));
    process.exit(1);
  }
  console.log(`✓ Twilio call queued!`);
  console.log(`  SID:    ${data.sid}`);
  console.log(`  Status: ${data.status}`);
  console.log(`\nPhone should ring in ~5 seconds.`);
  console.log(`Answer — Gemini Live Bengali agent will negotiate leather sandals.\n`);
  console.log(`Make sure the bridge is running: node haggl/workers/express-bridge.mjs`);
} catch (err) {
  console.error("Fetch error:", err.message);
  process.exit(1);
}
