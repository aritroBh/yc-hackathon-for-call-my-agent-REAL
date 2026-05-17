/**
 * Vapi custom-transcriber WebSocket adapter.
 *
 * Vapi opens a WSS to `transcriber.server.url`, sends a JSON `start` frame
 * then continuous binary 16-bit LE PCM — STEREO interleaved, ch0=customer,
 * ch1=assistant @ 16 kHz. Khaya ASR is batch HTTP only, so this module
 * buffers the customer channel, detects end-of-utterance with an energy/
 * silence VAD, and POSTs each utterance to Khaya, returning a Vapi
 * `transcriber-response`.
 *
 * Multi-turn design:
 *  - ONE WS lives for the whole call. A ping keepalive stops ngrok/Vapi from
 *    idle-closing it between turns.
 *  - Endpointed utterances are pushed to a per-session QUEUE and drained
 *    sequentially, so a second utterance spoken while Khaya is still
 *    transcribing the first is never dropped.
 *  - Message handling is fully guarded so a decode hiccup can't kill the WS.
 *  - close/error log the code+reason for diagnosis.
 *
 * TRANSCRIBER_DIAG=1 adds observability ONLY (no behavior change): per-window
 * ch0 vs ch1 RMS, verbatim non-binary frames, and per-utterance ch0/ch1 WAV
 * dumps to /tmp/diag so we can confirm whether garbled transcripts are agent
 * echo, noise, or Khaya mis-ASR — before designing the echo-suppression fix.
 *
 * Lives in the express-bridge (workers/express-bridge.mjs) because the
 * Next.js App Router cannot host a raw WebSocket server. Uses relative
 * imports so it loads cleanly when the bridge dynamically imports it.
 */
import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import * as fs from "fs";
import { khayaTranscribe } from "../khaya";
import { encodeWav, deinterleaveStereoChannel, rmsEnergy } from "../audio/wav";

const WS_PATH = "/vapi/transcriber";

// Endpointing knobs (int16 RMS scale / milliseconds).
// VAD raised (Fix #4) so breaths/noise don't register; no transcript-text
// filtering — short Twi answers ("Aane"/"Daabi") must survive.
const VAD_THRESHOLD = Number(process.env.KHAYA_VAD_THRESHOLD) || 1000;
const MIN_UTTERANCE_MS = 500;
const END_SILENCE_MS = 600;
const MAX_UTTERANCE_MS = 6000;

// ── Echo gate (Case A — measured) ─────────────────────────────────────────
// Vapi stereo: ch0=customer, ch1=assistant. Diagnostic call proved ch1 carries
// the agent TTS. Measured: real user speech ch0/ch1 ≈ 50 (ch1≈50 when the user
// talks); agent echo on ch0 has ch0/ch1 = 0.30–0.65. So while the agent is
// speaking, only count ch0 as real speech if it clearly dominates ch1 (a loud
// barge-in) — this rejects echo while PRESERVING barge-in.
const AGENT_THRESHOLD = Number(process.env.KHAYA_AGENT_THRESHOLD) || 800;
const BARGE_FACTOR = Number(process.env.KHAYA_BARGE_FACTOR) || 1.3;
const AGENT_HANGOVER_MS = 250; // covers the echo tail after ch1 goes quiet

const KEEPALIVE_MS = 10_000;
const MAX_QUEUED_UTTERANCES = 4;

const KHAYA_LANGUAGE = process.env.KHAYA_ASR_LANGUAGE || process.env.KHAYA_LANGUAGE || "tw";

// ── Diagnostics (observability only; no behavior change when off) ──────────
const DIAG = process.env.TRANSCRIBER_DIAG === "1";
const DIAG_DIR = "/tmp/diag";
const DIAG_WINDOW_MS = 250;
if (DIAG) {
  try {
    fs.mkdirSync(DIAG_DIR, { recursive: true });
  } catch {
    /* noop */
  }
}

interface Session {
  sampleRate: number;
  customerBuf: Buffer[];
  residual: Buffer; // carries a partial stereo frame across chunks
  totalMs: number;
  voicedMs: number;
  trailingSilenceMs: number;
  queue: Buffer[]; // endpointed utterance PCMs awaiting ASR
  draining: boolean;
  turns: number;
  closed: boolean;
  agentActiveUntil: number; // ms epoch; >now ⇒ agent (ch1) currently speaking
  // diag-only
  t0: number;
  seq: number;
  assistantBuf: Buffer[]; // ch1 captured in lockstep with customerBuf
  diagQ1: Buffer[]; // ch1 snapshots parallel to `queue`
  winMs: number;
  winCh0Sum: number;
  winCh1Sum: number;
  winN: number;
}

function newSession(): Session {
  return {
    sampleRate: 16000,
    customerBuf: [],
    residual: Buffer.alloc(0),
    totalMs: 0,
    voicedMs: 0,
    trailingSilenceMs: 0,
    queue: [],
    draining: false,
    turns: 0,
    closed: false,
    agentActiveUntil: 0,
    t0: Date.now(),
    seq: 0,
    assistantBuf: [],
    diagQ1: [],
    winMs: 0,
    winCh0Sum: 0,
    winCh1Sum: 0,
    winN: 0,
  };
}

function resetUtterance(s: Session): void {
  s.customerBuf = [];
  s.assistantBuf = [];
  s.totalMs = 0;
  s.voicedMs = 0;
  s.trailingSilenceMs = 0;
}

/** Drain queued utterances through Khaya sequentially (rate-friendly). */
async function drainQueue(s: Session, ws: WebSocket): Promise<void> {
  if (s.draining) return;
  s.draining = true;
  try {
    while (s.queue.length && !s.closed) {
      const pcm = s.queue.shift()!;
      const ch1 = DIAG ? s.diagQ1.shift() || Buffer.alloc(0) : Buffer.alloc(0);
      try {
        const wav = encodeWav(pcm, 16000, 1);
        const t0 = Date.now();
        const transcription = await khayaTranscribe(wav, KHAYA_LANGUAGE);

        if (DIAG) {
          s.seq += 1;
          const tag = `${DIAG_DIR}/utt-${String(s.seq).padStart(2, "0")}`;
          try {
            fs.writeFileSync(`${tag}-ch0.wav`, encodeWav(pcm, 16000, 1));
            if (ch1.length) fs.writeFileSync(`${tag}-ch1.wav`, encodeWav(ch1, 16000, 1));
          } catch {
            /* noop */
          }
          console.log(
            `[diag] utt ${s.seq} ch0=${pcm.length}b ch1=${ch1.length}b ` +
              `ch0Rms=${Math.round(rmsEnergy(pcm))} ch1Rms=${ch1.length ? Math.round(rmsEnergy(ch1)) : 0} ` +
              `khaya="${transcription}"`
          );
        }

        if (transcription && ws.readyState === ws.OPEN) {
          s.turns += 1;
          ws.send(
            JSON.stringify({
              type: "transcriber-response",
              transcription,
              channel: "customer",
              transcriptType: "final",
            })
          );
          console.log(
            `[vapi-transcriber] turn ${s.turns} (${Date.now() - t0}ms): "${transcription.slice(0, 80)}"`
          );
        }
      } catch (err: any) {
        console.error("[vapi-transcriber] Khaya ASR failed:", err?.message);
      }
    }
  } finally {
    s.draining = false;
  }
}

function enqueueUtterance(s: Session, ws: WebSocket): void {
  const pcm = Buffer.concat(s.customerBuf);
  const ch1 = DIAG ? Buffer.concat(s.assistantBuf) : Buffer.alloc(0);
  resetUtterance(s);
  if (pcm.length < 2) return;
  s.queue.push(pcm);
  if (DIAG) s.diagQ1.push(ch1);
  // Bound the backlog — drop the oldest if Khaya can't keep up.
  while (s.queue.length > MAX_QUEUED_UTTERANCES) {
    s.queue.shift();
    if (DIAG) s.diagQ1.shift();
  }
  void drainQueue(s, ws);
}

function handleBinary(s: Session, chunk: Buffer, ws: WebSocket): void {
  // Keep 4-byte stereo-frame alignment across chunk boundaries.
  const data = s.residual.length ? Buffer.concat([s.residual, chunk]) : chunk;
  const usable = Math.floor(data.length / 4) * 4;
  s.residual = data.subarray(usable);
  if (usable === 0) return;

  const frame = data.subarray(0, usable);
  const mono = deinterleaveStereoChannel(frame, 0); // ch0 = customer
  const ch1 = deinterleaveStereoChannel(frame, 1); // ch1 = assistant (agent)
  const samples = mono.length / 2;
  const durationMs = (samples / s.sampleRate) * 1000;
  const ch0Rms = rmsEnergy(mono);
  const ch1Rms = rmsEnergy(ch1);

  // Echo gate: while the agent (ch1) is speaking, ch0 is mostly echo of it.
  // Only accept ch0 as real speech if it clearly dominates ch1 (loud barge-in).
  const now = Date.now();
  if (ch1Rms > AGENT_THRESHOLD) s.agentActiveUntil = now + AGENT_HANGOVER_MS;
  const agentActive = now < s.agentActiveUntil;
  const bargeIn = ch0Rms > BARGE_FACTOR * ch1Rms;
  const isEcho = agentActive && !bargeIn;

  if (DIAG) {
    s.winCh0Sum += ch0Rms;
    s.winCh1Sum += ch1Rms;
    s.winN += 1;
    s.winMs += durationMs;
    if (s.winMs >= DIAG_WINDOW_MS) {
      const t = ((now - s.t0) / 1000).toFixed(1);
      console.log(
        `[diag] +${t}s ch0=${Math.round(s.winCh0Sum / s.winN)} ` +
          `ch1=${Math.round(s.winCh1Sum / s.winN)} ` +
          `agent=${agentActive ? 1 : 0} echo=${isEcho ? 1 : 0} ` +
          `voiced=${Math.round(s.voicedMs)}ms sil=${Math.round(s.trailingSilenceMs)}ms`
      );
      s.winMs = 0;
      s.winCh0Sum = 0;
      s.winCh1Sum = 0;
      s.winN = 0;
    }
  }

  if (isEcho) {
    // Drop the echo chunk; let any in-progress real utterance end so it flushes.
    if (s.voicedMs > 0) s.trailingSilenceMs += durationMs;
  } else {
    s.customerBuf.push(mono);
    if (DIAG) s.assistantBuf.push(ch1);
    s.totalMs += durationMs;
    if (ch0Rms > VAD_THRESHOLD) {
      s.voicedMs += durationMs;
      s.trailingSilenceMs = 0;
    } else if (s.voicedMs > 0) {
      s.trailingSilenceMs += durationMs;
    }
  }

  const endpointed = s.voicedMs >= MIN_UTTERANCE_MS && s.trailingSilenceMs >= END_SILENCE_MS;
  const cappedOut = s.totalMs >= MAX_UTTERANCE_MS;

  if (endpointed || cappedOut) {
    if (s.voicedMs >= MIN_UTTERANCE_MS) {
      enqueueUtterance(s, ws); // does NOT block; ASR runs in drainQueue
    } else {
      resetUtterance(s); // capped out with no real speech — drop
    }
  }
}

/**
 * Attach the custom-transcriber WS to an existing http.Server. Uses a
 * noServer WebSocketServer and a path-filtered upgrade listener so it
 * coexists with the bridge's socket.io server (different path).
 */
export function attachVapiTranscriber(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url || "", "http://localhost").pathname;
    } catch {
      return;
    }
    if (pathname !== WS_PATH) return; // let socket.io / others handle it
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket) => {
    const session = newSession();
    console.log(`[vapi-transcriber] connection opened${DIAG ? " (DIAG)" : ""}`);

    // Keepalive — ngrok free / Vapi will idle-close an otherwise quiet socket
    // between turns, which is what truncated calls to a single turn.
    let alive = true;
    ws.on("pong", () => {
      alive = true;
    });
    const keepalive = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return;
      if (!alive) {
        console.warn("[vapi-transcriber] no pong — terminating stale socket");
        try {
          ws.terminate();
        } catch {
          /* noop */
        }
        return;
      }
      alive = false;
      try {
        ws.ping();
      } catch {
        /* noop */
      }
    }, KEEPALIVE_MS);

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      try {
        if (!isBinary) {
          const raw = data.toString("utf8");
          if (DIAG) console.log(`[diag] ctrl-frame: ${raw.slice(0, 300)}`);
          try {
            const msg = JSON.parse(raw);
            if (msg?.type === "start") {
              if (typeof msg.sampleRate === "number") session.sampleRate = msg.sampleRate;
              session.t0 = Date.now();
              console.log(
                `[vapi-transcriber] start: ${msg.encoding} ${msg.sampleRate}Hz ${msg.channels}ch`
              );
            }
          } catch {
            /* non-JSON / unknown control frame — ignore */
          }
          return;
        }
        handleBinary(session, data, ws);
      } catch (err: any) {
        // Never let a decode hiccup kill the socket / end the call.
        console.error("[vapi-transcriber] message handler error:", err?.message);
      }
    });

    ws.on("close", (code: number, reason: Buffer) => {
      session.closed = true;
      clearInterval(keepalive);
      console.log(
        `[vapi-transcriber] connection closed code=${code} reason="${reason?.toString() || ""}" turns=${session.turns}`
      );
    });
    ws.on("error", (err: any) => {
      console.error("[vapi-transcriber] ws error:", err?.message);
    });
  });

  console.log(`[vapi-transcriber] attached at ${WS_PATH}`);
}
