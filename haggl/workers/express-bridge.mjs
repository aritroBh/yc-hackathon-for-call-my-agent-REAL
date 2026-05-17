import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const PORT = parseInt(process.env.SERVER_PORT || "3001", 10);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve .ts or .js based on runtime
function resolveLib(modulePath) {
  const jsPath = join(__dirname, "..", modulePath.replace(".ts", ".js"));
  const tsPath = join(__dirname, "..", modulePath);
  // In Docker standalone, compiled .js lives alongside the workers dir
  const standaloneJsPath = join(__dirname, modulePath.replace("../lib/", "./lib/").replace(".ts", ".js"));
  if (existsSync(jsPath)) return jsPath;
  if (existsSync(standaloneJsPath)) return standaloneJsPath;
  return tsPath; // fallback — tsx will handle it
}

// ── Lazy ESM imports ────────────────────────────────

let _sessionManager = null;
let _createDeepgramSession = null;
let _buildNegotiationPrompt = null;
let _mulawDecode = null;
let _upsample8to48 = null;
let _getDialectByLocale = null;

async function loadDeps() {
  if (_sessionManager) return;
  const sm = await import(resolveLib("../lib/sessionManager.ts"));
  const dg = await import(resolveLib("../lib/deepgram.ts"));
  const audio = await import(resolveLib("../lib/audio.ts"));
  const pb = await import(resolveLib("../lib/promptBuilder.ts"));
  _sessionManager = sm;
  _createDeepgramSession = dg.createDeepgramSession;
  _buildNegotiationPrompt = pb.buildNegotiationPrompt;
  _mulawDecode = audio.mulawDecode;
  _upsample8to48 = audio.upsample8to48;
}

function getSM() {
  return _sessionManager ? _sessionManager.getSessionManager() : null;
}

// ── Express + WS + Socket.io ─────────────────────────

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/media-stream" });
const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── REST endpoints ───────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    activeSessions: getSM()?.getActiveCount() || 0,
    uptime: process.uptime(),
  });
});

app.post("/call-status", (req, res) => {
  res.sendStatus(200);
});

// ── Socket.io: dashboard clients ─────────────────────

io.on("connection", (socket) => {
  console.log(`[io] Dashboard client connected: ${socket.id}`);

  const sm = getSM();
  if (sm) {
    const sessions = sm.getActiveSessions().map((s) => ({
      callId: s.callId,
      rfqId: s.rfqId,
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      phase: s.phase,
      startTime: s.startTime,
      transcriptCount: s.transcript.length,
    }));
    socket.emit("sessions:snapshot", sessions);
  }

  socket.on("disconnect", () => {
    console.log(`[io] Dashboard client disconnected: ${socket.id}`);
  });
});

function wireSocketIOEvents() {
  const sm = getSM();

  sm.on("session_created", (sessionId) => {
    const state = sm.getSession(sessionId);
    if (!state) return;
    io.emit("call:initiated", {
      callId: sessionId,
      rfqId: state.rfqId,
      supplierId: state.supplierId,
      supplierName: state.supplierName,
      phase: state.phase,
      startTime: state.startTime,
    });
  });

  sm.on("session_destroyed", (sessionId) => {
    io.emit("call:destroyed", { callId: sessionId });
  });

  sm.on("transcript_delta", (sessionId, entry) => {
    io.emit("call:transcript", {
      callId: sessionId,
      role: entry.role,
      content: entry.content,
      timestamp: entry.timestamp,
    });
  });

  sm.on("phase_change", (sessionId, phase) => {
    io.emit("call:phase_change", { callId: sessionId, phase });
  });

  sm.on("call_completed", (sessionId, result) => {
    io.emit("call:completed", { callId: sessionId, result });
  });

  sm.on("call_failed", (sessionId, error) => {
    io.emit("call:failed", { callId: sessionId, error });
  });

  sm.on("call_capped", (sessionId) => {
    io.emit("call:capped", { callId: sessionId });
  });

  sm.on("heartbeat_timeout", (sessionId) => {
    io.emit("call:heartbeat_timeout", { callId: sessionId });
  });
}

// ── WebSocket: /media-stream (Twilio) ────────────────

wss.on("connection", async (ws, req) => {
  await loadDeps();
  const sm = getSM();

  let sessionId = null;
  let callId = null;
  let streamSid = null;
  let twilioSid = null;
  let deepgramSession = null;
  let injector = null;
  const sessionStartTime = Date.now();

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.event === "start") {
        streamSid = msg.start.streamSid;
        twilioSid = msg.start.callSid;
        callId = msg.start.customParameters?.callId;

        if (!callId) { send({ event: "error", message: "Missing callId" }); return; }

        console.log(`[bridge] Stream start: call=${callId} twilio=${twilioSid}`);

        const { getCallById, getSupplierById, getRFQById, updateCallStatus } = await import(resolveLib("../lib/db.ts"));
        const call = await getCallById(callId);
        if (!call) { send({ event: "error", message: "Call not found" }); return; }

        const [supplier, rfq] = await Promise.all([
          getSupplierById(call.supplier_id),
          getRFQById(call.rfq_id),
        ]);
        if (!supplier || !rfq) { send({ event: "error", message: "Supplier/RFQ not found" }); return; }

        const promptResult = _buildNegotiationPrompt({
          rfq: {
            title: rfq.title,
            description: rfq.description,
            items: rfq.items || [],
            target_price: rfq.target_price,
            floor_price: rfq.floor_price,
            currency: rfq.currency || "USD",
            deadline: rfq.deadline,
          },
          supplier: {
            name: supplier.name,
            contact_name: supplier.contact_name,
            phone: supplier.phone,
            email: supplier.email,
            metadata: supplier.metadata || {},
          },
          aggressiveness: process.env.HAGGL_AGGRESSIVENESS || "medium",
          priority: process.env.HAGGL_PRIORITY || "balanced",
          aiDisclosure: true,
          useFloorPrice: false,
          maxConcessionRounds: 3,
          voicemailBehavior: "callback",
        });

        deepgramSession = _createDeepgramSession(promptResult.systemPrompt, {
          greeting: promptResult.greeting,
        });
        deepgramSession.setCallId(callId);

        deepgramSession.on("audio_out", (pcm24kBuf) => {
          if (sessionId) sm.routeDeepgramAudio(sessionId, pcm24kBuf);
        });

        const { OpusInjector } = await import(resolveLib("../lib/opusInjector.ts"));
        injector = new OpusInjector({
          injectText: (text) => {
            deepgramSession.sendInstruction(text);
          },
          negotiationContext: {
            partName: rfq.title,
            quantity: rfq.items?.[0]?.quantity || 0,
            targetPrice: rfq.target_price || 0,
            currency: rfq.currency || "USD",
            priority: "price"
          }
        });

        deepgramSession.on("transcript_delta", (entry) => {
          send({ event: "text", streamSid, text: JSON.stringify(entry) });
          if (entry.role === "user") injector.onSupplierText(entry.content);
          else if (entry.role === "assistant") injector.onAgentText(entry.content);
        });

        deepgramSession.on("function_call", async (payload) => {
          if (payload.name === "mark_complete") {
            console.log(`[bridge] Mark complete: call=${callId}`);
            const { updateCallStatus: ucs } = await import(resolveLib("../lib/db.ts"));
            await ucs(callId, {
              status: "completed",
              phase: "completed",
              result: payload.parameters,
              ended_at: new Date().toISOString(),
              duration_seconds: Math.round((Date.now() - sessionStartTime) / 1000),
            });
            if (twilioSid) {
              const { terminateCall } = await import(resolveLib("../lib/twilio.ts"));
              await terminateCall(twilioSid);
            }
            if (injector) injector.stop();
            if (deepgramSession) deepgramSession.disconnect();
            try { ws.close(1000, "Complete"); } catch {}
          }
        });

        deepgramSession.on("error", (err) => console.error(`[bridge] DG error:`, err));

        deepgramSession.connect();
        injector.start();

        sm.createSession({
          callId,
          rfqId: call.rfq_id,
          supplierId: call.supplier_id,
          supplierName: supplier.name,
          twilioCallSid: twilioSid,
          streamSid,
          twilioSocket: ws,
          deepgramSession,
        });

        await updateCallStatus(callId, {
          status: "in_progress",
          twilio_call_sid: twilioSid,
          stream_sid: streamSid,
          started_at: new Date().toISOString(),
        });

        sessionId = callId;

      } else if (msg.event === "media") {
        if (deepgramSession && msg.media?.payload) {
          const mulawBuf = Buffer.from(msg.media.payload, "base64");
          deepgramSession.sendAudio(mulawBuf);
        }
      } else if (msg.event === "stop") {
        console.log(`[bridge] Stream stopped: ${streamSid}`);
        if (injector) { injector.stop(); injector = null; }
        if (deepgramSession) { deepgramSession.disconnect(); deepgramSession = null; }
        if (sessionId) sm.destroySession(sessionId, "stream_stopped");
      }
    } catch (err) {
      console.error("[bridge] Message error:", err);
    }
  });

  ws.on("close", () => {
    if (injector) { injector.stop(); injector = null; }
    if (deepgramSession) { deepgramSession.disconnect(); deepgramSession = null; }
    if (sessionId) sm.destroySession(sessionId, "ws_close");
  });

  ws.on("error", (err) => console.error("[bridge] WS error:", err));

  setTimeout(() => {
    if (ws.readyState === ws.OPEN) {
      console.log(`[bridge] Hard cap: ${sessionId}`);
      if (injector) injector.stop();
      if (deepgramSession) deepgramSession.disconnect();
      send({ event: "hard_cap", message: "Call duration limit reached" });
      try { ws.close(1000, "Hard cap"); } catch {}
    }
  }, 480_000);
});

// ── Start ────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[bridge] HAGGL bridge listening on :${PORT}`);
  console.log(`[bridge] WS: ws://localhost:${PORT}/media-stream`);
  console.log(`[bridge] IO: http://localhost:${PORT}`);
  loadDeps()
    .then(() => wireSocketIOEvents())
    .catch((err) => console.error("[bridge] Startup dependency load failed:", err));
});

process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
process.on("SIGINT", () => { server.close(() => process.exit(0)); });
