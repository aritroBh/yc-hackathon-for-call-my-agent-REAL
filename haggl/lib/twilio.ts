/**
 * Twilio outbound calling and media stream management with retry logic.
 *
 * Flow:
 *   1. createOutboundCall() → Twilio REST API → call initiated
 *   2. Twilio calls our statusCallback URL with state updates
 *   3. createOutboundCall() returns inline <Connect><Stream> TwiML
 *   4. Twilio opens WebSocket to /media-stream for audio
 *   5. terminateCall() → Twilio REST API → call ended
 */

import twilio from "twilio";
import type { CallStatus } from "@/types/database";
import { withRetry } from "@/lib/retry";
import { logger } from "@/lib/logger";

let _client: twilio.Twilio | null = null;

function getClient(): twilio.Twilio {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  _client = twilio(sid, token);
  return _client;
}

export function generateStreamTwiML(
  streamUrl: string,
  callId: string,
  supplierPhone: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}">
      <Parameter name="callId" value="${escapeXml(callId)}" />
      <Parameter name="supplierPhone" value="${escapeXml(supplierPhone)}" />
    </Stream>
  </Connect>
</Response>`;
}

export function generateDisclosureTwiML(
  streamUrl: string,
  callId: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">
    This is an AI-assisted call from HAGGL, an automated procurement platform.
    This call may be recorded for quality and training purposes.
    Please hold while we connect you.
  </Say>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}">
      <Parameter name="callId" value="${escapeXml(callId)}" />
    </Stream>
  </Connect>
</Response>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface OutboundCallResult {
  success: boolean;
  callSid: string | null;
  error: string | null;
}

export async function createOutboundCall(
  to: string,
  callId: string,
  options?: {
    from?: string;
    statusCallbackUrl?: string;
    timeoutSeconds?: number;
    record?: boolean;
  },
): Promise<OutboundCallResult> {
  const client = getClient();
  const from = options?.from || process.env.TWILIO_PHONE_NUMBER;
  const statusCallbackBase =
    process.env.TWILIO_WEBHOOK_BASE ||
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const serverBase =
    process.env.SERVER_WEBHOOK_BASE ||
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    "http://localhost:3001";

  if (!from) {
    return { success: false, callSid: null, error: "TWILIO_PHONE_NUMBER not configured" };
  }

  const statusCallback =
    options?.statusCallbackUrl || `${statusCallbackBase}/api/calls/stream`;
  const timeout = options?.timeoutSeconds ?? 30;

  const wsServerUrl = serverBase.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  const twiml = generateDisclosureTwiML(`${wsServerUrl}/media-stream`, callId);

  const log = logger.child({
    callId,
    metadata: { to, from, statusCallbackBase, serverBase },
  });

  try {
    const call = await withRetry(
      async () => {
        const result = await client.calls.create({
          to,
          from,
          twiml,
          statusCallback,
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          timeout,
        });
        return result;
      },
      {
        maxAttempts: 3,
        baseDelayMs: 2000,
        jitter: true,
        onRetry: (attempt, err, delay) => {
          log.warn(`Twilio call create retry ${attempt}`, { error: err.message, metadata: { delayMs: delay } });
        },
      },
    );
    log.info("Outbound call created", { metadata: { callSid: call.sid } });
    return { success: true, callSid: call.sid, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Outbound call failed", { error: message });
    return { success: false, callSid: null, error: message };
  }
}

export async function terminateCall(callSid: string): Promise<boolean> {
  const client = getClient();
  const log = logger.child({ metadata: { callSid } });
  try {
    await client.calls(callSid).update({ status: "completed" });
    log.info("Call terminated");
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Terminate call failed", { error: message });
    return false;
  }
}

export interface StatusWebhookPayload {
  CallSid: string;
  CallStatus: CallStatus | string;
  Called: string;
  Caller: string;
  Direction: "inbound" | "outbound-api" | "outbound-dial";
  Timestamp: string;
  Duration?: string;
  callId?: string;
}

export function parseStatusWebhook(body: Record<string, string>): StatusWebhookPayload {
  return {
    CallSid: body.CallSid,
    CallStatus: body.CallStatus as CallStatus,
    Called: body.Called,
    Caller: body.Caller,
    Direction: body.Direction as StatusWebhookPayload["Direction"],
    Timestamp: body.Timestamp,
    Duration: body.Duration,
    callId: body.callId || body.CallSid,
  };
}

export function mapTwilioStatusToCallStatus(
  twilioStatus: string,
): CallStatus {
  const map: Record<string, CallStatus> = {
    queued: "queued",
    ringing: "ringing",
    in_progress: "in_progress",
    completed: "completed",
    busy: "busy",
    failed: "failed",
    "no-answer": "no_answer",
    canceled: "rejected",
  };
  return map[twilioStatus] || "failed";
}

export function estimateCallCost(
  durationSeconds: number,
  direction: "inbound" | "outbound" = "outbound",
): number {
  const ratePerMinuteMillicents = direction === "outbound" ? 130 : 100;
  const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
  return minutes * ratePerMinuteMillicents;
}

export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  return twilio.validateRequest(authToken, signature, url, params);
}
