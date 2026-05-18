import { config as dotenvConfig } from "dotenv";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, resolve } from "path";
import { existsSync } from "fs";
import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity } from "@google/genai";

// Load .env — try repo root first, then haggl/, then CWD
{
  const __d = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    resolve(__d, "../../.env"),
    resolve(__d, "../.env"),
    resolve(process.cwd(), ".env"),
  ]) {
    const r = dotenvConfig({ path: candidate });
    if (!r.error) { console.log(`[env] loaded from ${candidate}`); break; }
  }
}

const PORT = parseInt(process.env.SERVER_PORT || "3001", 10);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveLib(modulePath) {
  const localPath = join(__dirname, modulePath);
  const jsPath = join(__dirname, "..", modulePath.replace(".ts", ".js"));
  const standaloneJsPath = join(__dirname, modulePath.replace("../lib/", "./lib/").replace(".ts", ".js"));
  let resolved = localPath;
  if (existsSync(jsPath)) resolved = jsPath;
  else if (existsSync(standaloneJsPath)) resolved = standaloneJsPath;
  return pathToFileURL(resolved).href;
}

const app = express();
const server = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Gemini Live audio helpers (inline, no external deps) ─────────────

function mulawDecode(mulawBuf) {
  const BIAS = 33;
  const out = Buffer.allocUnsafe(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    const uval = ~mulawBuf[i] & 0xff;
    let t = ((uval & 0x0f) << 3) + BIAS;
    t <<= (uval & 0x70) >> 4;
    const sample = uval & 0x80 ? BIAS - t : t - BIAS;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return out;
}

function linear16ToMulaw(pcm) {
  const BIAS = 33;
  const out = Buffer.allocUnsafe(pcm.length / 2);
  for (let i = 0; i < out.length; i++) {
    let sample = pcm.readInt16LE(i * 2);
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    sample = Math.min(sample, 32635);
    sample += BIAS;
    let exp = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exp > 0; exp--, expMask >>= 1) {}
    const mantissa = (sample >> (exp + 3)) & 0x0f;
    out[i] = ~(sign | (exp << 4) | mantissa) & 0xff;
  }
  return out;
}

function resampleLinear(pcm, fromRate, toRate) {
  if (fromRate === toRate) return pcm;
  const samples = pcm.length / 2;
  const outSamples = Math.round(samples * toRate / fromRate);
  const out = Buffer.allocUnsafe(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const pos = i * (samples - 1) / Math.max(1, outSamples - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = pcm.readInt16LE(idx * 2);
    const b = idx + 1 < samples ? pcm.readInt16LE((idx + 1) * 2) : a;
    out.writeInt16LE(Math.round(a + frac * (b - a)), i * 2);
  }
  return out;
}

// Lazy singleton — same import URL = same module = shared in-memory store
let _geminiState = null;
async function getGeminiState() {
  if (!_geminiState) {
    _geminiState = await import(resolveLib("../lib/vapi/geminiCallState.ts"));
  }
  return _geminiState;
}

// ── REST endpoints ───────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    activeSessions: 0,
    uptime: process.uptime(),
  });
});

app.post("/call-status", (req, res) => {
  res.sendStatus(200);
});

// Serve Gemini Live audio to Vapi custom-voice (called when Vapi wants TTS)
app.post("/vapi/gemini-voice", async (req, res) => {
  const hcid = req.query.hcid || req.body?.message?.metadata?.hcid || "";
  const requestedRate = req.body?.message?.sampleRate || 24000;

  if (!hcid) {
    res.set("Content-Type", "application/octet-stream");
    return res.send(Buffer.alloc(Math.floor(requestedRate * 0.2) * 2)); // 200ms silence
  }

  try {
    const { popGeminiAudio } = await getGeminiState();
    const mulawBuf = await popGeminiAudio(hcid, 2500);

    if (!mulawBuf || !mulawBuf.length) {
      res.set("Content-Type", "application/octet-stream");
      return res.send(Buffer.alloc(Math.floor(requestedRate * 0.2) * 2));
    }

    // mulaw 8kHz → PCM16 8kHz → PCM16 at requestedRate
    const pcm8k = mulawDecode(mulawBuf);
    const pcmOut = resampleLinear(pcm8k, 8000, requestedRate);
    res.set("Content-Type", "application/octet-stream");
    res.set("Cache-Control", "no-cache");
    res.send(pcmOut);
  } catch (err) {
    console.error("[bridge] /vapi/gemini-voice error:", err.message);
    res.set("Content-Type", "application/octet-stream");
    res.send(Buffer.alloc(Math.floor(requestedRate * 0.2) * 2));
  }
});

// Serve Gemini Live text to Next.js LLM handler
app.get("/gemini-text/:callId", async (req, res) => {
  try {
    const { popGeminiText } = await getGeminiState();
    const text = await popGeminiText(req.params.callId, 3000);
    res.json({ text: text || null });
  } catch (err) {
    console.error("[bridge] /gemini-text error:", err.message);
    res.json({ text: null });
  }
});

// ── Twilio Media Streams ─────────────────────────────

// Read env at request time so ngrok auto-detect (which runs after server.listen) takes effect.
function getBridgeWsUrl() {
  const base = process.env.BRIDGE_PUBLIC_WS_URL || process.env.TWILIO_WEBHOOK_BASE || "http://localhost:3001";
  return base.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

// TwiML webhook — Twilio calls this when the outbound call is answered.
// Returns <Connect><Stream> to start bidirectional audio.
app.post("/call/twiml", (req, res) => {
  const hcid = req.query.hcid || `twilio_${Date.now()}`;
  const lang = req.query.lang || "bn";
  // & must be &amp; in XML attributes
  const wsUrl =
    `${getBridgeWsUrl()}/call/stream` +
    `?hcid=${encodeURIComponent(hcid)}&amp;lang=${encodeURIComponent(lang)}`;
  console.log(`[twiml] stream url: ${wsUrl}`);
  res.type("text/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Connect><Stream url="${wsUrl}" track="inbound_track"/></Connect></Response>`
  );
});

// Twilio Media Streams WebSocket — receives mulaw 8kHz from Twilio,
// forwards to Gemini Live, streams Gemini audio back.
// ws handles its own upgrade handler with path filtering — no manual handler needed.
const twilioWss = new WebSocketServer({ server, path: "/call/stream" });

// ── Inline Gemini Live session (avoids TypeScript module resolution issues) ──

let _geminiAI = null;
function getGeminiAI() {
  if (!_geminiAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("[gemini] GEMINI_API_KEY is not set");
    _geminiAI = new GoogleGenAI({ apiKey });
  }
  return _geminiAI;
}

async function openGeminiSession(systemPromptText, opts = {}) {
  const ai = getGeminiAI();

  function downsample24kTo8k(pcm) { return resampleLinear(pcm, 24000, 8000); }
  function upsample8kTo16k(pcm) { return resampleLinear(pcm, 8000, 16000); }

  let liveSession;
  try {
    liveSession = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: systemPromptText,
        temperature: 0,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          ...(opts.languageCode ? { languageCode: opts.languageCode } : {}),
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            silenceDurationMs: 700,
          },
        },
      },
      callbacks: {
        onopen: () => console.log("[gemini-live] websocket open, waiting for setupComplete"),
        onmessage: (msg) => {
          if (msg.setupComplete) {
            console.log("[gemini-live] setup complete — ready");
            // Notionbrain pattern: inject exact opening cue after setup, then wait for supplier
            const openingCue = opts.openingCue ||
              `[Outbound call just connected. Say EXACTLY this in Bengali and nothing more: ` +
              `"নমস্কার! আমি HAGGL-এর পক্ষ থেকে কথা বলছি। আপনি কি এখন কথা বলতে পারবেন?" ` +
              `— then stop speaking and wait silently for the supplier to respond. ` +
              `Do not say anything else until they reply.]`;
            try { liveSession.sendRealtimeInput({ text: openingCue }); } catch { /* ignore */ }
            opts.onSetupComplete?.();
          }
          const inputText = msg.serverContent?.inputTranscription?.text;
          if (inputText) {
            console.log(`[gemini-live] supplier: "${inputText.slice(0, 80)}"`);
            opts.onSupplierTranscript?.(inputText);
          }
          const outputText = msg.serverContent?.outputTranscription?.text;
          if (outputText) {
            console.log(`[gemini-live] agent: "${outputText.slice(0, 80)}"`);
            opts.onAgentTranscript?.(outputText);
          }
          // Audio response from Gemini
          const b64Audio = msg.data;
          if (b64Audio) {
            const pcm24k = Buffer.from(b64Audio, "base64");
            const pcm8k = downsample24kTo8k(pcm24k);
            const mulawBuf = linear16ToMulaw(pcm8k);
            opts.onAudioOutput?.(mulawBuf);
          }
        },
        onerror: (e) => {
          console.error("[gemini-live] error:", e?.message ?? e);
          opts.onError?.(new Error(String(e?.message ?? e)));
        },
        onclose: (e) => {
          console.log(`[gemini-live] closed code=${e.code} reason=${e.reason}`);
          opts.onClose?.();
        },
      },
    });
  } catch (err) {
    throw new Error(`[gemini-live] connect failed: ${err?.message ?? err}`);
  }

  return {
    // Accept mulaw Buffer — decode → upsample → send PCM16k to Gemini
    sendAudio(mulawBuf) {
      const pcm8k = mulawDecode(mulawBuf);
      const pcm16k = upsample8kTo16k(pcm8k);
      liveSession.sendRealtimeInput({ audio: { data: pcm16k.toString("base64"), mimeType: "audio/pcm;rate=16000" } });
    },
    sendText(text) {
      liveSession.sendRealtimeInput({ text });
    },
    close() {
      try { liveSession.close(); } catch { /* already closed */ }
    },
  };
}

// ── Notionbrain pattern: open Gemini ONLY after receiving the Twilio `start` event ──
// This eliminates garbage audio priming the model before the conversation begins,
// which was causing Gemini to reply to its own audio output (feedback loop).
twilioWss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", "http://localhost");
  const hcid = url.searchParams.get("hcid") || `twilio_${Date.now()}`;
  const lang = url.searchParams.get("lang") || "bn";
  const langCode = lang === "bn" ? "bn-IN" : lang === "hi" ? "hi-IN" : "en-US";

  console.log(`[twilio-stream] connected hcid=${hcid} lang=${lang}`);

  let streamSid = null;
  let geminiHandle = null;
  let closed = false;

  const systemPrompt =
    `You are a Bengali-speaking procurement agent for HAGGL, negotiating to purchase ` +
    `500 pairs of men's leather sandals (sizes 40–45, full-grain). ` +
    `Target price: $4.25/pair. Hard ceiling: $5.00/pair. Delivery: within 4 weeks.\n\n` +

    `VOICE RULES — NON-NEGOTIABLE:\n` +
    `- Max 2 sentences per response. Prefer 1.\n` +
    `- Ask ONE question per turn. Never two questions in the same response.\n` +
    `- No lists, bullet points, numbered items, or markdown — this is a phone call.\n` +
    `- Always use contractions and natural shortened forms in Bengali.\n` +
    `- Start sentences naturally: "আচ্ছা,", "হ্যাঁ,", "দেখুন —", "আসলে —", "বলুন,"\n` +
    `- BANNED acknowledgments (never use): "অবশ্যই", "নিশ্চয়ই", "ধন্যবাদ আপনার মতামতের জন্য", "আমি বুঝতে পারছি"\n` +
    `- Rotate short acknowledgments (max once per 4 turns each): "ঠিক আছে।" / "বুঝলাম।" / "হ্যাঁ।" / "আচ্ছা।"\n` +
    `- Use stall phrases when thinking: "একটু ভাবছি।" / "এক সেকেন্ড।" / "ঠিকঠাক বলছি —"\n\n` +

    `LANGUAGE RULES:\n` +
    `- Primary language: Bengali (formal আপনি form).\n` +
    `- If supplier speaks Hindi, respond briefly in Hindi then return to Bengali.\n` +
    `- If supplier speaks English, respond in English briefly then return to Bengali.\n\n` +

    `NEGOTIATION APPROACH:\n` +
    `- Build rapport first — one or two warm exchanges before price.\n` +
    `- Anchor low. Acknowledge their constraints. Find middle ground.\n` +
    `- Confirm any agreed price and delivery terms explicitly before ending.\n\n` +

    `TURN-TAKING RULE: After you finish speaking, go completely silent and wait. ` +
    `Do not speak again until the supplier has responded. Never reply to your own audio.`;

  ws.on("message", async (raw) => {
    try {
      const frame = JSON.parse(raw.toString());

      if (frame.event === "start") {
        // Notionbrain pattern: open Gemini HERE, not on WS connect
        streamSid = frame.start?.streamSid;
        console.log(`[twilio-stream] streamSid=${streamSid}`);

        try {
          geminiHandle = await openGeminiSession(systemPrompt, {
            languageCode: langCode,
            onAudioOutput: (audioBuf) => {
              if (closed || !streamSid || ws.readyState !== 1) return;
              ws.send(JSON.stringify({
                event: "media",
                streamSid,
                media: { payload: audioBuf.toString("base64") },
              }));
            },
            onAgentTranscript: (text) => {
              console.log(`[twilio-stream] agent: "${text.slice(0, 80)}"`);
            },
            onSupplierTranscript: (text) => {
              console.log(`[twilio-stream] supplier: "${text.slice(0, 80)}"`);
            },
          });
          console.log(`[twilio-stream] Gemini Live session ready hcid=${hcid}`);
        } catch (err) {
          console.error(`[twilio-stream] Gemini Live open failed:`, err.message);
        }

      } else if (frame.event === "media") {
        // Only forward audio AFTER Gemini session is open (after start event)
        if (!geminiHandle) return;
        const mulaw = Buffer.from(frame.media.payload, "base64");
        geminiHandle.sendAudio(mulaw);

      } else if (frame.event === "stop") {
        console.log(`[twilio-stream] stream stopped`);
        if (geminiHandle) { geminiHandle.close(); geminiHandle = null; }
      }
    } catch { /* ignore parse errors */ }
  });

  ws.on("close", () => {
    closed = true;
    console.log(`[twilio-stream] WS closed hcid=${hcid}`);
    if (geminiHandle) { geminiHandle.close(); geminiHandle = null; }
  });

  ws.on("error", (err) => {
    console.error(`[twilio-stream] WS error hcid=${hcid}:`, err.message);
  });
});

// ── Start ────────────────────────────────────────────

// Query the ngrok local API (always on 4040) to get the current HTTPS tunnel URL.
// If found AND the env TWILIO_WEBHOOK_BASE is still localhost/default, override both
// TWILIO_WEBHOOK_BASE and BRIDGE_PUBLIC_WS_URL so TwiML and WS URLs are correct
// without updating .env every ngrok restart.
async function detectNgrokUrl() {
  try {
    const res = await fetch("http://localhost:4040/api/tunnels", { signal: AbortSignal.timeout(1000) });
    const data = await res.json();
    const tunnel = data.tunnels?.find((t) => t.proto === "https");
    return tunnel?.public_url || null;
  } catch {
    return null;
  }
}

server.listen(PORT, async () => {
  console.log(`[bridge] HAGGL socket bridge listening on :${PORT}`);
  console.log(`[bridge] IO: http://localhost:${PORT}`);

  // Auto-detect ngrok tunnel
  const ngrokUrl = await detectNgrokUrl();
  if (ngrokUrl) {
    const isLocalWebhook = !process.env.TWILIO_WEBHOOK_BASE ||
      process.env.TWILIO_WEBHOOK_BASE.includes("localhost");
    if (isLocalWebhook) {
      process.env.TWILIO_WEBHOOK_BASE = ngrokUrl;
      process.env.BRIDGE_PUBLIC_WS_URL = ngrokUrl.replace(/^https:\/\//, "wss://");
    }
    console.log(`[ngrok] tunnel: ${ngrokUrl}`);
    console.log(`[twilio] twiml endpoint: ${ngrokUrl}/call/twiml`);
  } else {
    console.log(`[twilio] twiml endpoint: ${process.env.TWILIO_WEBHOOK_BASE || "http://localhost:"+PORT}/call/twiml`);
  }
  
  (async () => {
    try {
      const { initMossIndex } = await import(resolveLib("../lib/sponsors/moss.ts"));
      await initMossIndex();
      console.log('[startup] Moss index ready');
    } catch (err) {
      console.warn('[startup] Moss index init failed (non-fatal):', err.message);
    }
  })();

  // Vapi custom-transcriber WS (buffers audio, calls Khaya ASR). Lives here
  // because the Next.js App Router cannot host a raw WebSocket server.
  (async () => {
    try {
      const { attachVapiTranscriber } = await import(resolveLib("../lib/vapi/transcriberSocket.ts"));
      attachVapiTranscriber(server);
    } catch (err) {
      console.warn('[startup] Vapi transcriber attach failed (non-fatal):', err.message);
    }
  })();
});

process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
process.on("SIGINT", () => { server.close(() => process.exit(0)); });
