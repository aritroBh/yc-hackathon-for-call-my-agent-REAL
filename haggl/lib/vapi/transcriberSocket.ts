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
 * Lives in the express-bridge (workers/express-bridge.mjs) because the
 * Next.js App Router cannot host a raw WebSocket server. Uses relative
 * imports so it loads cleanly when the bridge dynamically imports it.
 */
import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { khayaTranscribe } from "../khaya";
import { encodeWav, deinterleaveStereoChannel, rmsEnergy } from "../audio/wav";

const WS_PATH = "/vapi/transcriber";

// Endpointing knobs (int16 RMS scale / milliseconds).
const VAD_THRESHOLD = 500;
const MIN_UTTERANCE_MS = 300;
const END_SILENCE_MS = 550;
const MAX_UTTERANCE_MS = 6000;

const KEEPALIVE_MS = 10_000;
const MAX_QUEUED_UTTERANCES = 4;

const KHAYA_LANGUAGE = process.env.KHAYA_ASR_LANGUAGE || process.env.KHAYA_LANGUAGE || "tw";

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
  };
}

function resetUtterance(s: Session): void {
  s.customerBuf = [];
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
      try {
        const wav = encodeWav(pcm, 16000, 1);
        const t0 = Date.now();
        const transcription = await khayaTranscribe(wav, KHAYA_LANGUAGE);
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
  resetUtterance(s);
  if (pcm.length < 2) return;
  s.queue.push(pcm);
  // Bound the backlog — drop the oldest if Khaya can't keep up.
  while (s.queue.length > MAX_QUEUED_UTTERANCES) s.queue.shift();
  void drainQueue(s, ws);
}

function handleBinary(s: Session, chunk: Buffer, ws: WebSocket): void {
  // Keep 4-byte stereo-frame alignment across chunk boundaries.
  const data = s.residual.length ? Buffer.concat([s.residual, chunk]) : chunk;
  const usable = Math.floor(data.length / 4) * 4;
  s.residual = data.subarray(usable);
  if (usable === 0) return;

  const mono = deinterleaveStereoChannel(data.subarray(0, usable), 0);
  const samples = mono.length / 2;
  const durationMs = (samples / s.sampleRate) * 1000;

  s.customerBuf.push(mono);
  s.totalMs += durationMs;

  if (rmsEnergy(mono) > VAD_THRESHOLD) {
    s.voicedMs += durationMs;
    s.trailingSilenceMs = 0;
  } else if (s.voicedMs > 0) {
    s.trailingSilenceMs += durationMs;
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
    console.log("[vapi-transcriber] connection opened");

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
          try {
            const msg = JSON.parse(data.toString("utf8"));
            if (msg?.type === "start") {
              if (typeof msg.sampleRate === "number") session.sampleRate = msg.sampleRate;
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
