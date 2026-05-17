/**
 * Vapi provisioning client — replaces lib/agentphone.ts.
 *
 * Voice orchestration is Vapi with three custom providers we host:
 *   transcriber → Khaya ASR  (WS, express-bridge: lib/vapi/transcriberSocket.ts)
 *   model       → haggl negotiation core (app/api/vapi/llm/chat/completions)
 *   voice       → Khaya TTS  (app/api/vapi/voice)
 *
 * One assistant is created per call (mirrors the old per-call AgentPhone agent)
 * so the haggl call id can be baked into the model/voice URLs — Vapi does not
 * template those URLs.
 */
import axios from "axios";
import { withRetry } from "./retry";
import { logger } from "./logger";

const BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";
const API_KEY = process.env.VAPI_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const BRIDGE_WS_URL = process.env.BRIDGE_PUBLIC_WS_URL || "wss://localhost:3001";
const PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

function getHeaders() {
  if (!API_KEY) {
    throw new Error("VAPI_API_KEY is not configured in environment variables");
  }
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface VapiAssistantParams {
  name: string;
  systemPrompt: string;
  language: "twi" | "akan" | "yoruba" | "english" | string;
  beginMessage: string;
  /** haggl call id — baked into model/voice URLs for context binding. */
  hagglCallId: string;
}

export async function createVapiAssistant(
  params: VapiAssistantParams
): Promise<{ assistantId: string }> {
  // CONFIRMED: Vapi appends `/chat/completions` to model.url (after the query
  // string, which corrupts it). So the call id goes in the PATH; Vapi turns
  // `${APP}/api/vapi/llm/<hcid>` into `${APP}/api/vapi/llm/<hcid>/chat/completions`,
  // matching app/api/vapi/llm/[hcid]/chat/completions/route.ts.
  const llmUrl = `${APP_URL}/api/vapi/llm/${encodeURIComponent(params.hagglCallId)}`;
  const voiceUrl = `${APP_URL}/api/vapi/voice?hcid=${encodeURIComponent(params.hagglCallId)}`;

  const body = {
    name: params.name,
    firstMessage: params.beginMessage,
    transcriber: {
      provider: "custom-transcriber",
      server: { url: `${BRIDGE_WS_URL}/vapi/transcriber` },
    },
    model: {
      provider: "custom-llm",
      // Label only — provider is custom-llm so our endpoint (Gemini) handles it.
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      url: llmUrl,
      metadataSendMode: "off",
      messages: [{ role: "system", content: params.systemPrompt }],
      temperature: 0.7,
    },
    voice: {
      provider: "custom-voice",
      server: { url: voiceUrl },
    },
    server: { url: `${APP_URL}/api/vapi/webhook` },
    metadata: { haggl_call_id: params.hagglCallId },
    endCallFunctionEnabled: false,
    // Reduce echo-driven FALSE barge-in on Vapi's side while still allowing a
    // real interruption: require a couple of words / a beat of voice before
    // the agent stops, and denoise the inbound customer audio.
    backgroundDenoisingEnabled: true,
    stopSpeakingPlan: { numWords: 2, voiceSeconds: 0.3, backoffSeconds: 1.5 },
    // Vapi counts silence from the last USER utterance; Khaya batch ASR/TTS
    // + a long agent turn can exceed 30s between user turns. Keep it high so
    // the call doesn't hang up mid-negotiation.
    silenceTimeoutSeconds: 120,
    maxDurationSeconds: 480,
  };

  const log = logger.child({
    callId: params.hagglCallId,
    metadata: { name: params.name, language: params.language },
  });
  log.info("Creating Vapi assistant", { metadata: { llmUrl, voiceUrl } });

  try {
    const result = await withRetry(async () => {
      const res = await axios.post(`${BASE_URL}/assistant`, body, {
        headers: getHeaders(),
        timeout: 10000,
      });
      return res.data;
    });

    const assistantId = result.id || result.assistantId;
    log.info("Vapi assistant created", { metadata: { assistantId } });
    return { assistantId };
  } catch (err: any) {
    log.error("Failed to create Vapi assistant", {
      error: err.message,
      metadata: { status: err?.response?.status, data: err?.response?.data },
    });
    throw err;
  }
}

export interface VapiOutboundCallParams {
  assistantId: string;
  toPhone: string;
  callId: string;
}

export async function createVapiCall(
  params: VapiOutboundCallParams
): Promise<{ vapiCallId: string }> {
  if (!PHONE_NUMBER_ID) {
    throw new Error(
      "VAPI_PHONE_NUMBER_ID is not configured — import a Twilio/Vonage number in the Vapi dashboard"
    );
  }

  const body = {
    assistantId: params.assistantId,
    phoneNumberId: PHONE_NUMBER_ID,
    customer: { number: params.toPhone },
    metadata: { haggl_call_id: params.callId },
  };

  const log = logger.child({
    callId: params.callId,
    metadata: { toPhone: params.toPhone },
  });
  log.info("Initiating Vapi outbound call", {
    metadata: { assistantId: params.assistantId },
  });

  try {
    const result = await withRetry(async () => {
      const res = await axios.post(`${BASE_URL}/call`, body, {
        headers: getHeaders(),
        timeout: 10000,
      });
      return res.data;
    });

    const vapiCallId = result.id || result.callId;
    log.info("Vapi outbound call initiated", { metadata: { vapiCallId } });
    return { vapiCallId };
  } catch (err: any) {
    log.error("Failed to initiate Vapi outbound call", {
      error: err.message,
      metadata: { status: err?.response?.status, data: err?.response?.data },
    });
    throw err;
  }
}

/** Map Vapi call status/endedReason → the worker's expected status vocabulary. */
function mapVapiStatus(status: string, endedReason?: string): string {
  if (status === "ended") {
    const r = (endedReason || "").toLowerCase();
    if (r.includes("no-answer") || r.includes("did-not-answer") || r.includes("no_answer")) {
      return "no_answer";
    }
    if (r.includes("busy")) return "busy";
    if (r.includes("rejected") || r.includes("declined")) return "rejected";
    if (r.includes("failed") || r.includes("error")) return "failed";
    return "completed";
  }
  if (status === "in-progress" || status === "forwarding") return "in_progress";
  if (status === "ringing" || status === "queued") return "ringing";
  return status;
}

export async function getVapiCall(
  vapiCallId: string
): Promise<{ status: string; duration: number }> {
  try {
    const result = await withRetry(async () => {
      const res = await axios.get(`${BASE_URL}/call/${vapiCallId}`, {
        headers: getHeaders(),
        timeout: 10000,
      });
      return res.data;
    });

    return {
      status: mapVapiStatus(result.status, result.endedReason),
      duration:
        typeof result.duration === "number"
          ? result.duration
          : result.startedAt && result.endedAt
            ? Math.round(
                (new Date(result.endedAt).getTime() -
                  new Date(result.startedAt).getTime()) /
                  1000
              )
            : 0,
    };
  } catch (err: any) {
    logger.error("Failed to retrieve Vapi call", {
      metadata: { vapiCallId },
      error: err.message,
    });
    throw err;
  }
}

export async function endVapiCall(vapiCallId: string): Promise<void> {
  try {
    await withRetry(async () => {
      await axios.patch(
        `${BASE_URL}/call/${vapiCallId}`,
        { status: "ended" },
        { headers: getHeaders(), timeout: 10000 }
      );
    });
    logger.info("Vapi call ended", { metadata: { vapiCallId } });
  } catch (err: any) {
    logger.error("Failed to end Vapi call", {
      metadata: { vapiCallId },
      error: err.message,
    });
  }
}
