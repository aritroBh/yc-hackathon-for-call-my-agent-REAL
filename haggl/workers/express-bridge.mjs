// Twilio/Deepgram audio bridge removed — using AgentPhone
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

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
const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ── Socket.io: dashboard clients ─────────────────────

io.on("connection", (socket) => {
  console.log(`[io] Dashboard client connected: ${socket.id}`);

  socket.on("call_status_changed", (data) => {
    io.emit("call_status_changed", data);
  });

  socket.on("transcript_delta", (data) => {
    io.emit("transcript_delta", data);
  });

  socket.on("reasoning_trace", (data) => {
    io.emit("reasoning_trace", data);
  });

  socket.on("disconnect", () => {
    console.log(`[io] Dashboard client disconnected: ${socket.id}`);
  });
});

// ── Start ────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[bridge] HAGGL socket bridge listening on :${PORT}`);
  console.log(`[bridge] IO: http://localhost:${PORT}`);
  
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
