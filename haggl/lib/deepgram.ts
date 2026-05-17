/**
 * Deepgram Voice Agent WebSocket client.
 *
 * Connects to wss://agent.deepgram.com/v1/agent/converse
 * using the unified Listen → Think (Gemini) → Speak pipeline.
 *
 * Audio flow:
 *   Twilio → mulaw 8kHz → decode → upsample → linear16 48kHz → Deepgram WS
 *   Deepgram WS → linear16 24kHz → downsample → encode → mulaw 8kHz → Twilio
 *
 * All events are emitted through callbacks for the session manager to route.
 */

import WebSocket from "ws";
import { EventEmitter } from "node:events";
import {
  mulawDecode,
  mulawEncode,
  upsample8to48,
  downsample24to8,
  pcmToBuffer,
  bufferToPcm,
} from "@/lib/audio";
import { buildNegotiationPrompt as buildPromptV2 } from "@/lib/promptBuilder";
import { logger } from "@/lib/logger";
import { withRetry, CircuitBreaker } from "@/lib/retry";

// ── Constants ───────────────────────────────────────

const DEEPGRAM_WS_URL = "wss://agent.deepgram.com/v1/agent/converse";
const KEEPALIVE_INTERVAL_MS = 10_000;
const RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 20_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const PENDING_FRAME_LIMIT = 500;
const RECONNECT_JITTER = 0.3;

// ── Event types ─────────────────────────────────────

export interface DeepgramEvents {
  ready: [];
  transcript_delta: [entry: TranscriptDelta];
  agent_started_speaking: [];
  agent_finished_speaking: [];
  user_started_speaking: [];
  function_call: [call: FunctionCallPayload];
  error: [err: DeepgramError];
  closed: [code: number, reason: string];
  audio_out: [pcm24k: Buffer];
}

export interface TranscriptDelta {
  role: "agent" | "user";
  content: string;
  timestamp: string;
}

export interface FunctionCallPayload {
  name: string;
  parameters: Record<string, unknown>;
  call_id: string;
}

export interface DeepgramError {
  code: string;
  description: string;
  type?: string;
}

// ── Agent configuration ─────────────────────────────

export interface AgentSettings {
  audio: {
    input: { encoding: "linear16"; sample_rate: 48000 };
    output: { encoding: "linear16"; sample_rate: 24000 };
  };
  agent: {
    listen: { provider: { type: "deepgram" }; model: string };
    think: {
      provider: { type: "google" };
      model: string;
      prompt: string;
      functions: AgentFunction[];
    };
    speak: {
      provider: { type: "deepgram" };
      model: string;
    };
    greeting?: string;
  };
}

export interface AgentFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ── Default negotiation functions ──────────────────

export const MARK_COMPLETE_FN: AgentFunction = {
  name: "mark_complete",
  description:
    "Mark the negotiation call as complete and record the final outcome. " +
    "Call this when the supplier has given a final quote or the negotiation has concluded.",
  parameters: {
    type: "object",
    properties: {
      quoted_price: {
        type: "number",
        description: "The final quoted price from the supplier",
      },
      quoted_terms: {
        type: "string",
        description: "Payment terms agreed upon (e.g. Net 30, Net 60)",
      },
      delivery_timeline: {
        type: "string",
        description: "Expected delivery timeline",
      },
      confidence_score: {
        type: "number",
        description:
          "Confidence score 0-100 that this supplier will close",
      },
      structured_offer: {
        type: "object",
        description: "Structured breakdown of the offer",
      },
    },
    required: ["confidence_score"],
  },
};

// ── Default system prompt ───────────────────────────

export interface OldBuildNegotiationPromptParams {
  supplierName: string;
  supplierContact: string | null;
  rfqTitle: string;
  rfqDescription: string;
  items: string;
  targetPrice: number | null;
  dialectPrompt: string | null;
  useFloorPrice: boolean;
}

export function buildNegotiationPrompt(
  params: OldBuildNegotiationPromptParams,
): string;
export function buildNegotiationPrompt(
  params: OldBuildNegotiationPromptParams & { _v2?: boolean },
): string {
  if ((params as any)._v2) {
    const v2Result = buildPromptV2({
      rfq: {
        title: params.rfqTitle,
        description: params.rfqDescription,
        items: parseItemsString(params.items),
        target_price: params.targetPrice,
        floor_price: null,
        currency: "USD",
        deadline: null,
      },
      supplier: {
        name: params.supplierName,
        contact_name: params.supplierContact,
        phone: "",
        email: null,
        metadata: {},
      },
    });
    return v2Result.systemPrompt;
  }

  const dialect = params.dialectPrompt
    ? `\n\nCOMMUNICATION STYLE:\n${params.dialectPrompt}`
    : "";

  return `You are an AI procurement negotiation agent for HAGGL.

YOUR ROLE:
You are calling a supplier on behalf of a buyer to negotiate pricing and terms for a procurement request.

MANDATORY RULES:
1. You MUST begin the call by disclosing: "This is an AI-powered assistant calling from HAGGL. This call may be recorded for quality purposes."
2. You MUST NEVER reveal your floor price, maximum budget, or any internal pricing limits.
3. You MUST keep the entire call under 8 minutes.
4. Be professional, polite, and persistent.
5. If asked if you are AI, confirm honestly: "Yes, I am an AI assistant authorized to negotiate on behalf of our company."
6. If asked to transfer to a human, politely explain that you can handle the negotiation and a human will follow up via email.
7. Always confirm specific pricing, delivery timelines, and payment terms before ending.

CURRENT NEGOTIATION:
- Buyer: ${params.rfqTitle}
- Requirements: ${params.rfqDescription}
- Items: ${params.items}
- Target Price: ${params.targetPrice ? `$${params.targetPrice.toLocaleString()}` : "Best market price"}

SUPPLIER:
- Name: ${params.supplierName}
- Contact: ${params.supplierContact || "Available representative"}
${dialect}

NEGOTIATION STRATEGY:
1. Greet warmly and deliver the AI disclosure
2. Explain what you're looking for
3. Ask for their best price and terms
4. If they counter, negotiate respectfully toward the target
5. Listen for objections and address them
6. When a conclusion is reached, call mark_complete()

Remember: you are negotiating on behalf of the buyer to get the best possible value. Be firm but polite.`;
}

function parseItemsString(items: string): { sku: string; description: string; quantity: number; unit: string; target_unit_price: number | null }[] {
  if (!items || items === "No specific items listed") return [];
  try {
    const segments = items.split(";").filter(Boolean);
    return segments.map((s) => {
      const trimmed = s.trim();
      const match = trimmed.match(/(\d+)\s+(\S+)\s+of\s+"([^"]+)"(?:\s+@\s+\$?([\d.]+)\/ea)?/);
      if (match) {
        return {
          sku: "",
          description: match[3],
          quantity: parseInt(match[1], 10),
          unit: match[2],
          target_unit_price: match[4] ? parseFloat(match[4]) : null,
        };
      }
      return { sku: "", description: trimmed, quantity: 0, unit: "unit", target_unit_price: null };
    });
  } catch {
    return [];
  }
}

// ── Deepgram Session ────────────────────────────────

export interface DeepgramSessionOptions {
  apiKey: string;
  systemPrompt: string;
  greeting?: string;
  functions?: AgentFunction[];
  onEvent?: (event: keyof DeepgramEvents, ...args: any[]) => void;
}

export class DeepgramSession extends EventEmitter {
  private ws: WebSocket | null = null;
  private wsSeq = 0;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private isReady = false;
  private reconnectAttempts = 0;
  private pendingFrames: Buffer[] = [];
  private intentionalClose = false;
  private isSpeaking = false;
  private options: DeepgramSessionOptions;
  private callId: string | null = null;

  constructor(options: DeepgramSessionOptions) {
    super();
    this.options = options;
  }

  setCallId(id: string): void {
    this.callId = id;
  }

  // ── Connect ──────────────────────────────────────────

  connect(): void {
    this.intentionalClose = false;
    this.connectWs();
  }

  private connectWs(): void {
    this.wsSeq++;
    const seq = this.wsSeq;
    try {
      this.ws = new WebSocket(DEEPGRAM_WS_URL, ["token", this.options.apiKey]);
    } catch (err) {
      this.emitError("CONNECTION_FAILED", String(err));
      this.scheduleReconnect();
      return;
    }

    const ws = this.ws;
    ws.on("open", () => {
      if (this.wsSeq !== seq) return;
      this.onWSOpen();
    });
    ws.on("message", (data: WebSocket.Data) => {
      if (this.wsSeq !== seq) return;
      this.onWSMessage(data);
    });
    ws.on("close", (code: number, reason: Buffer) => {
      if (this.wsSeq !== seq) return;
      this.onWSClose(code, reason);
    });
    ws.on("error", (err: Error) => {
      if (this.wsSeq !== seq) return;
      this.onWSError(err);
    });
  }

  // ── Send audio (from Twilio) ────────────────────────

  sendAudio(mulawBuffer: Buffer): void {
    if (!this.isReady) {
      if (this.pendingFrames.length < PENDING_FRAME_LIMIT) {
        this.pendingFrames.push(mulawBuffer);
      }
      return;
    }
    const pcm8k = mulawDecode(mulawBuffer);
    const pcm48k = upsample8to48(pcm8k);
    const pcmBuf = pcmToBuffer(pcm48k);
    this.sendBinary(pcmBuf);
  }

  // ── Send text message ───────────────────────────────

  sendText(text: string): void {
    this.sendJson({ type: "UserText", text });
  }

  // ── Disconnect ─────────────────────────────────────

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    if (this.ws) {
      try {
        this.ws.close(1000, "Session ended");
      } catch {}
      this.ws = null;
    }
  }

  // ── State queries ───────────────────────────────────

  get isAgentSpeaking(): boolean {
    return this.isSpeaking;
  }

  get isSessionReady(): boolean {
    return this.isReady;
  }

  // ── Internal: WebSocket event handlers ──────────────

  private onWSOpen(): void {
    this.reconnectAttempts = 0;
    this.startKeepalive();
    this.sendSettings();
  }

  private onWSMessage(data: WebSocket.Data): void {
    if (data instanceof Buffer) {
      this.handleBinaryFrame(data);
      return;
    }
    try {
      const msg = JSON.parse(data.toString());
      this.handleJSONMessage(msg);
    } catch {
      // ignore malformed JSON
    }
  }

  private onWSClose(code: number, reason: Buffer): void {
    const reasonStr = reason.toString();
    this.isReady = false;
    this.stopKeepalive();
    this.emit("closed" as any, code, reasonStr);

    if (!this.intentionalClose && code !== 1000 && code !== 1001) {
      this.emitError("WS_CLOSED", `Code ${code}: ${reasonStr}`);
      this.scheduleReconnect();
    }
  }

  private onWSError(err: Error): void {
    this.emitError("WS_ERROR", err.message);
  }

  // ── Settings handshake ──────────────────────────────

  private sendSettings(): void {
    const settings: AgentSettings = {
      audio: {
        input: { encoding: "linear16", sample_rate: 48000 },
        output: { encoding: "linear16", sample_rate: 24000 },
      },
      agent: {
        listen: {
          provider: { type: "deepgram" },
          model: "nova-2-phonecall",
        },
        think: {
          provider: { type: "google" },
          model: "gemini-2.5-flash",
          prompt: this.options.systemPrompt,
          functions: this.options.functions || [MARK_COMPLETE_FN],
        },
        speak: {
          provider: { type: "deepgram" },
          model: "aura-2-odysseus-en",
        },
      },
    };

    if (this.options.greeting) {
      settings.agent.greeting = this.options.greeting;
    }

    this.sendJson(settings);
  }

  // ── Message handlers ────────────────────────────────

  private handleJSONMessage(msg: Record<string, any>): void {
    switch (msg.type) {
      case "Welcome":
        break;

      case "SettingsApplied":
        this.isReady = true;
        this.flushPendingFrames();
        this.emit("ready" as any);
        break;

      case "ConversationText":
        this.handleConversationText(msg);
        break;

      case "AgentStartedSpeaking":
        this.isSpeaking = true;
        this.emit("agent_started_speaking" as any);
        break;

      case "AgentAudioDone":
        this.isSpeaking = false;
        this.emit("agent_finished_speaking" as any);
        break;

      case "UserStartedSpeaking":
        this.emit("user_started_speaking" as any);
        break;

      case "FunctionCallRequest":
        this.handleFunctionCall(msg);
        break;

      case "Error":
        this.emitError(msg.code || "UNKNOWN", msg.description || "Unknown error");
        break;

      default:
        break;
    }
  }

  private handleConversationText(msg: Record<string, any>): void {
    const role = msg.role === "assistant" ? "agent" : "user";
    const entry: TranscriptDelta = {
      role,
      content: msg.content || "",
      timestamp: new Date().toISOString(),
    };
    this.emit("transcript_delta" as any, entry);
  }

  private handleFunctionCall(msg: Record<string, any>): void {
    let params: Record<string, unknown> = {};
    if (typeof msg.parameters === "string") {
      try {
        params = JSON.parse(msg.parameters);
      } catch {}
    } else if (msg.parameters && typeof msg.parameters === "object") {
      params = msg.parameters;
    }

    const payload: FunctionCallPayload = {
      name: msg.function_name,
      parameters: params,
      call_id: msg.call_id || "",
    };
    this.emit("function_call" as any, payload);
  }

  private handleBinaryFrame(data: Buffer): void {
    this.emit("audio_out" as any, data);
  }

  // ── Reconnect logic (exponential backoff + jitter) ─

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emitError("RECONNECT_EXHAUSTED", "Max reconnection attempts reached");
      logger.error("Deepgram reconnect exhausted", { callId: this.callId || undefined });
      return;
    }
    this.reconnectAttempts++;
    const expBackoff = Math.min(
      MAX_RECONNECT_DELAY_MS,
      RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
    );
    const jitter = expBackoff * (1 - RECONNECT_JITTER + Math.random() * 2 * RECONNECT_JITTER);
    const delay = Math.round(jitter);
    logger.warn("Deepgram reconnecting", {
      metadata: { attempt: this.reconnectAttempts, max: MAX_RECONNECT_ATTEMPTS, delayMs: delay },
    });
    this.emitError("RECONNECTING", `Attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    setTimeout(() => this.connectWs(), delay);
  }

  // ── Keepalive ──────────────────────────────────────

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      this.sendJson({ type: "KeepAlive" });
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  // ── Pending frame buffer ───────────────────────────

  private flushPendingFrames(): void {
    for (const frame of this.pendingFrames) {
      this.sendAudio(frame);
    }
    this.pendingFrames = [];
  }

  // ── Low-level send ─────────────────────────────────

  private sendJson(obj: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private sendBinary(buf: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buf);
    }
  }

  // ── Cleanup ────────────────────────────────────────

  private cleanup(): void {
    this.isReady = false;
    this.stopKeepalive();
    this.pendingFrames = [];
  }

  // ── Error emission ─────────────────────────────────

  private emitError(code: string, description: string): void {
    this.emit("error" as any, {
      code,
      description,
      type: "deepgram",
    } as DeepgramError);
  }
}

// ── Factory ──────────────────────────────────────────

export function createDeepgramSession(
  systemPrompt: string,
  options?: {
    greeting?: string;
    apiKey?: string;
    functions?: AgentFunction[];
  },
): DeepgramSession {
  const apiKey = options?.apiKey || process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not configured");

  return new DeepgramSession({
    apiKey,
    systemPrompt,
    greeting: options?.greeting,
    functions: options?.functions,
  });
}
