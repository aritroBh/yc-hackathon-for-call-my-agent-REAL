import axios from "axios";
import { withRetry } from "./retry";
import { logger } from "./logger";

const BASE_URL = process.env.AGENTPHONE_API_BASE_URL || "https://api.agentphone.ai/v1";
const API_KEY = process.env.AGENTPHONE_API_KEY;

function getHeaders() {
  if (!API_KEY) {
    throw new Error("AGENTPHONE_API_KEY is not configured in environment variables");
  }
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

function getVoiceForLanguage(lang: string): string {
  // Use multilingual voices that support West African languages
  if (lang === "yoruba") return "Polly.Vitoria"; // closest available; we inject language in prompt
  if (lang === "twi" || lang === "akan") return "Polly.Vitoria";
  return "Polly.Joanna-Neural";
}

export interface AgentPhoneAgentParams {
  name: string;
  systemPrompt: string;
  language: "twi" | "akan" | "yoruba" | "english" | string;
  beginMessage: string;
}

export async function createAgentPhoneAgent(
  params: AgentPhoneAgentParams
): Promise<{ agentId: string }> {
  const webhookUrl =
    process.env.AGENTPHONE_WEBHOOK_URL ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/agentphone/webhook`;

  const body = {
    name: params.name,
    voiceMode: "webhook",
    systemPrompt: params.systemPrompt,
    beginMessage: params.beginMessage,
    voice: getVoiceForLanguage(params.language),
    sttMode: "accurate", // critical for Twi/Akan/Yoruba accuracy
    ambientSound: "office",
    webhookUrl,
  };

  const log = logger.child({ metadata: { name: params.name, language: params.language } });
  log.info("Creating AgentPhone voice agent", { metadata: { webhookUrl } });

  try {
    const result = await withRetry(async () => {
      const res = await axios.post(`${BASE_URL}/agents`, body, {
        headers: getHeaders(),
        timeout: 10000,
      });
      return res.data;
    });

    log.info("AgentPhone voice agent created successfully", {
      metadata: { agentId: result.agentId || result.id },
    });
    return { agentId: result.agentId || result.id };
  } catch (err: any) {
    log.error("Failed to create AgentPhone agent", { error: err.message });
    throw err;
  }
}

export interface OutboundCallParams {
  agentId: string;
  toPhone: string;
  callId: string;
}

export async function createOutboundCall(
  params: OutboundCallParams
): Promise<{ agentPhoneCallId: string }> {
  const body = {
    agentId: params.agentId,
    to: params.toPhone,
    metadata: { haggl_call_id: params.callId },
  };

  const log = logger.child({ callId: params.callId, metadata: { toPhone: params.toPhone } });
  log.info("Initiating AgentPhone outbound call", { metadata: { agentId: params.agentId } });

  try {
    const result = await withRetry(async () => {
      const res = await axios.post(`${BASE_URL}/calls`, body, {
        headers: getHeaders(),
        timeout: 10000,
      });
      return res.data;
    });

    const callSid = result.agentPhoneCallId || result.callId || result.id;
    log.info("AgentPhone outbound call initiated successfully", {
      metadata: { callSid },
    });
    return { agentPhoneCallId: callSid };
  } catch (err: any) {
    log.error("Failed to initiate AgentPhone outbound call", { error: err.message });
    throw err;
  }
}

export async function getCall(
  agentPhoneCallId: string
): Promise<{ status: string; duration: number }> {
  try {
    const result = await withRetry(async () => {
      const res = await axios.get(`${BASE_URL}/calls/${agentPhoneCallId}`, {
        headers: getHeaders(),
        timeout: 10000,
      });
      return res.data;
    });

    return {
      status: result.status,
      duration: result.duration || 0,
    };
  } catch (err: any) {
    logger.error("Failed to retrieve AgentPhone call", {
      metadata: { agentPhoneCallId },
      error: err.message,
    });
    throw err;
  }
}

export async function endCall(agentPhoneCallId: string): Promise<void> {
  try {
    await withRetry(async () => {
      await axios.delete(`${BASE_URL}/calls/${agentPhoneCallId}`, {
        headers: getHeaders(),
        timeout: 10000,
      });
    });
    logger.info("AgentPhone call ended successfully", { metadata: { agentPhoneCallId } });
  } catch (err: any) {
    logger.error("Failed to terminate AgentPhone call", {
      metadata: { agentPhoneCallId },
      error: err.message,
    });
    throw err;
  }
}

export async function* streamTranscript(
  agentPhoneCallId: string
): AsyncGenerator<{ role: string; text: string }> {
  const url = `${BASE_URL}/calls/${agentPhoneCallId}/transcript/stream`;
  
  try {
    const response = await fetch(url, {
      headers: getHeaders() as any,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") return;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.event === "turn" || parsed.role) {
              yield {
                role: parsed.role || parsed.data?.role,
                text: parsed.text || parsed.data?.text || "",
              };
            }
          } catch {
            // ignore JSON parse errors of individual SSE chunks
          }
        }
      }
    }
  } catch (err: any) {
    logger.error("Failed to stream AgentPhone transcript", {
      metadata: { agentPhoneCallId },
      error: err.message,
    });
    throw err;
  }
}
