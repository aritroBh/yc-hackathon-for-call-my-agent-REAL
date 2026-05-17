/**
 * Twilio Media Streams endpoint.
 *
 * This route serves multiple purposes:
 *   GET  /api/calls/stream?callId=xxx → Returns TwiML for Media Streams connection
 *   POST /api/calls/stream             → Twilio status callback webhook
 *
 * The actual WebSocket audio streaming happens via the Express bridge
 * at workers/express-bridge.mjs on port 3001, which handles the
 * /media-stream WebSocket upgrade. This route provides the TwiML
 * that tells Twilio where to connect the stream.
 *
 * Architecture:
 *   Twilio → HTTP GET /api/calls/stream → gets <Connect><Stream> TwiML
 *   Twilio → WS wss://host:3001/media-stream → audio flows through sessionManager
 */

import { NextRequest, NextResponse } from "next/server";
import { generateDisclosureTwiML } from "@/lib/twilio";

// ── GET: Return TwiML for Media Streams ────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const callId = searchParams.get("callId");

  if (!callId) {
    return new NextResponse("Missing callId parameter", { status: 400 });
  }

  // Build the WebSocket URL for the Express bridge
  const baseUrl =
    process.env.SERVER_WEBHOOK_BASE ||
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.TWILIO_WEBHOOK_BASE ||
    "http://localhost:3001";
  const wsBaseUrl = baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  const streamUrl = `${wsBaseUrl}/media-stream`;

  const twiml = generateDisclosureTwiML(streamUrl, callId);

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}

// ── POST: Twilio status callback ───────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const signature = req.headers.get("x-twilio-signature");
    const fullUrl = req.url;

    const formData = await req.formData();
    const body: Record<string, string> = {};
    formData.forEach((value, key) => {
      body[key] = String(value);
    });

    const isDemo = process.env.DEMO_MODE === "true" || process.env.NODE_ENV === "test";
    
    if (!isDemo) {
      const { validateTwilioSignature } = await import("@/lib/twilio");
      const authToken = process.env.TWILIO_AUTH_TOKEN || "";
      if (!signature || !validateTwilioSignature(authToken, fullUrl, body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const { parseStatusWebhook, mapTwilioStatusToCallStatus } = await import(
      "@/lib/twilio"
    );
    const { getDb, updateCallStatus, getCallByTwilioSid } = await import(
      "@/lib/db"
    );
    const { getSessionManager } = await import("@/lib/sessionManager");

    const webhook = parseStatusWebhook(body);
    const sm = getSessionManager();
    const now = new Date().toISOString();

    // Find matching session by Twilio SID
    const sessions = sm
      .getActiveSessions()
      .filter((s) => s.twilioCallSid === webhook.CallSid);

    if (sessions.length > 0) {
      const session = sessions[0];
      const callStatus = mapTwilioStatusToCallStatus(webhook.CallStatus);

      if (callStatus === "completed" || callStatus === "failed") {
        sm.destroySession(session.callId, `twilio_${callStatus}`);
      }
    }

    // Update database
    const existingCall = await getCallByTwilioSid(webhook.CallSid);
    if (existingCall) {
      await updateCallStatus(existingCall.id, {
        status: mapTwilioStatusToCallStatus(webhook.CallStatus),
        duration_seconds: webhook.Duration
          ? parseInt(webhook.Duration, 10)
          : null,
        ended_at:
          webhook.CallStatus === "completed"
            ? now
            : existingCall.ended_at,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: true });
  }
}
