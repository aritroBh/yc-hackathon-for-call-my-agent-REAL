/**
 * Active call session manager.
 *
 * Tracks every live negotiation call session:
 * - Bridges Twilio ↔ Deepgram audio
 * - Enforces the 8-minute hard cap
 * - Heartbeat to detect stale sessions
 * - Clean termination on disconnect/timeout
 * - Emits transcript events for the dashboard
 */

import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import { DeepgramSession, type TranscriptDelta, type FunctionCallPayload } from "@/lib/deepgram";
import { bufferToPcm, downsample24to8, mulawEncode } from "@/lib/audio";

// ── Constants ───────────────────────────────────────

const CALL_HARD_CAP_MS = 480_000; // 8 minutes
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;
const STALL_WARNING_MS = 120_000; // 2 minutes of silence

// ── Session state ───────────────────────────────────

export type SessionPhase =
  | "connecting"
  | "disclosure"
  | "negotiating"
  | "closing"
  | "completed"
  | "failed"
  | "capped";

export interface CallSessionState {
  callId: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  twilioCallSid: string | null;
  streamSid: string | null;
  phase: SessionPhase;
  twilioSocket: WebSocket | null;
  deepgramSession: DeepgramSession | null;
  startTime: number;
  lastAudioTimestamp: number;
  transcript: TranscriptDelta[];
  result: Record<string, unknown> | null;
  errorMessage: string | null;
}

export interface SessionEvents {
  session_created: [sessionId: string];
  session_destroyed: [sessionId: string];
  transcript_delta: [sessionId: string, entry: TranscriptDelta];
  phase_change: [sessionId: string, phase: SessionPhase];
  function_call: [sessionId: string, call: FunctionCallPayload];
  call_completed: [sessionId: string, result: Record<string, unknown>];
  call_failed: [sessionId: string, error: string];
  call_capped: [sessionId: string];
  heartbeat_timeout: [sessionId: string];
}

// ── Session Manager ─────────────────────────────────

export class SessionManager extends EventEmitter {
  private sessions = new Map<string, CallSessionState>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor() {
    super();
  }

  // ── Start ────────────────────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    this.isRunning = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.sessions.forEach((_val, sessionId) => {
      this.destroySession(sessionId, "server_shutdown");
    });
  }

  // ── Session lifecycle ────────────────────────────────

  createSession(params: {
    callId: string;
    rfqId: string;
    supplierId: string;
    supplierName: string;
    twilioCallSid: string | null;
    streamSid: string | null;
    twilioSocket: WebSocket;
    deepgramSession: DeepgramSession;
  }): string {
    const { callId, deepgramSession } = params;
    const now = Date.now();

    const state: CallSessionState = {
      callId: params.callId,
      rfqId: params.rfqId,
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      twilioCallSid: params.twilioCallSid,
      streamSid: params.streamSid,
      phase: "connecting",
      twilioSocket: params.twilioSocket,
      deepgramSession: params.deepgramSession,
      startTime: now,
      lastAudioTimestamp: now,
      transcript: [],
      result: null,
      errorMessage: null,
    };

    this.sessions.set(callId, state);
    this.emit("session_created" as any, callId);

    // Wire deepgram event handlers
    this.wireDeepgramEvents(callId, deepgramSession);

    // Wire Twilio socket close
    params.twilioSocket.on("close", () => {
      this.handleTwilioDisconnect(callId);
    });

    // Set hard cap timer
    setTimeout(() => this.enforceHardCap(callId), CALL_HARD_CAP_MS);

    return callId;
  }

  private wireDeepgramEvents(sessionId: string, dg: DeepgramSession): void {
    dg.on("ready", () => {
      const state = this.getSession(sessionId);
      if (state) state.phase = "disclosure";
      this.emit("phase_change" as any, sessionId, "disclosure");
    });

    dg.on("transcript_delta", (entry: TranscriptDelta) => {
      const state = this.getSession(sessionId);
      if (state) {
        state.transcript.push(entry);
        if (state.transcript.length > 1000) {
          state.transcript = state.transcript.slice(-500);
        }
      }
      this.emit("transcript_delta" as any, sessionId, entry);
    });

    dg.on("agent_started_speaking", () => {
      this.emit("phase_change" as any, sessionId, "negotiating");
    });

    dg.on("function_call", (call: FunctionCallPayload) => {
      this.emit("function_call" as any, sessionId, call);
      if (call.name === "mark_complete") {
        const state = this.getSession(sessionId);
        if (state) {
          state.result = call.parameters;
          state.phase = "completed";
        }
        this.emit("call_completed" as any, sessionId, call.parameters);
      }
    });

    dg.on("error", (err: { code: string; description: string }) => {
      const state = this.getSession(sessionId);
      if (state) {
        state.errorMessage = `[${err.code}] ${err.description}`;
      }
      this.emit("call_failed" as any, sessionId, err.description);
    });

    dg.on("closed", () => {
      const state = this.getSession(sessionId);
      if (state && state.phase !== "completed" && state.phase !== "capped") {
        state.phase = "failed";
        this.emit("phase_change" as any, sessionId, "failed");
      }
    });
  }

  // ── Session access ─────────────────────────────────

  getSession(sessionId: string): CallSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  getActiveCount(): number {
    return this.sessions.size;
  }

  getActiveSessions(): CallSessionState[] {
    const result: CallSessionState[] = [];
    this.sessions.forEach((s) => result.push(s));
    return result;
  }

  getSessionsByRFQ(rfqId: string): CallSessionState[] {
    const result: CallSessionState[] = [];
    this.sessions.forEach((s) => {
      if (s.rfqId === rfqId) result.push(s);
    });
    return result;
  }

  // ── Audio routing ─────────────────────────────────

  routeTwilioAudio(sessionId: string, mulawPayload: Buffer): void {
    const state = this.getSession(sessionId);
    if (!state?.deepgramSession) return;
    state.lastAudioTimestamp = Date.now();
    state.deepgramSession.sendAudio(mulawPayload);
  }

  routeDeepgramAudio(sessionId: string, pcm24kBuf: Buffer): void {
    const state = this.getSession(sessionId);
    if (!state?.twilioSocket || state.twilioSocket.readyState !== 1) return;
    state.lastAudioTimestamp = Date.now();

    const pcm24k = bufferToPcm(pcm24kBuf);
    const pcm8k = downsample24to8(pcm24k);
    const mulawBuf = mulawEncode(pcm8k);

    state.twilioSocket.send(
      JSON.stringify({
        event: "media",
        streamSid: state.streamSid,
        media: { payload: mulawBuf.toString("base64") },
      }),
    );
  }

  // ── Session destruction ───────────────────────────

  destroySession(sessionId: string, reason: string): void {
    const state = this.getSession(sessionId);
    if (!state) return;

    // Disconnect Deepgram
    if (state.deepgramSession) {
      try {
        state.deepgramSession.disconnect();
      } catch {}
    }

    // Close Twilio socket
    if (state.twilioSocket && state.twilioSocket.readyState === 1) {
      try {
        state.twilioSocket.close(1000, reason);
      } catch {}
    }

    this.sessions.delete(sessionId);
    this.emit("session_destroyed" as any, sessionId);
  }

  // ── Hard cap enforcement ─────────────────────────

  private enforceHardCap(sessionId: string): void {
    const state = this.getSession(sessionId);
    if (!state) return;
    if (state.phase === "completed" || state.phase === "failed") return;

    state.phase = "capped";
    state.errorMessage = "Call exceeded 8-minute hard cap";

    if (state.deepgramSession) {
      try {
        state.deepgramSession.disconnect();
      } catch {}
    }

    if (state.twilioSocket && state.twilioSocket.readyState === 1) {
      try {
        state.twilioSocket.close(1000, "Hard cap reached");
      } catch {}
    }

    this.emit("call_capped" as any, sessionId);
    this.sessions.delete(sessionId);
    this.emit("session_destroyed" as any, sessionId);
  }

  // ── Heartbeat ────────────────────────────────────────

  private checkHeartbeats(): void {
    const now = Date.now();
    this.sessions.forEach((state, sessionId) => {
      const elapsed = now - state.lastAudioTimestamp;
      if (elapsed > HEARTBEAT_TIMEOUT_MS) {
        state.phase = "failed";
        state.errorMessage = "Heartbeat timeout";
        this.emit("heartbeat_timeout" as any, sessionId);
        this.emit("call_failed" as any, sessionId, "Heartbeat timeout - no audio for 30s");
        this.destroySession(sessionId, "heartbeat_timeout");
      }
    });
  }

  // ── Twilio disconnect handler ─────────────────────

  private handleTwilioDisconnect(sessionId: string): void {
    const state = this.getSession(sessionId);
    if (!state) return;

    if (state.phase !== "completed" && state.phase !== "capped") {
      state.phase = "failed";
      state.errorMessage = "Twilio WebSocket disconnected";
      this.emit("call_failed" as any, sessionId, "Twilio WebSocket disconnected");
    }

    this.destroySession(sessionId, "twilio_disconnected");
  }
}

// ── Singleton ────────────────────────────────────────

let _instance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!_instance) {
    _instance = new SessionManager();
    _instance.start();
  }
  return _instance;
}
