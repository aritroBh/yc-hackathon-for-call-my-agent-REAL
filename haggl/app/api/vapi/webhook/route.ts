/**
 * Vapi server webhook (assistant `server.url`).
 *
 * Primary completion signal for a call. On end-of-call we run the terminal
 * finalize logic (the old AgentPhone `agent.call_ended` path). Informational
 * events are acknowledged with 200.
 */
import { NextResponse } from "next/server";
import { finalizeCall } from "@/lib/negotiation/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}) as any);
    const message = body?.message ?? {};
    const type: string = message?.type ?? "";

    const status: string = message?.status ?? message?.call?.status ?? "";
    const isEnded =
      type === "end-of-call-report" ||
      type === "hang" ||
      (type === "status-update" && status === "ended");

    if (isEnded) {
      const hagglCallId =
        message?.call?.metadata?.haggl_call_id ||
        body?.call?.metadata?.haggl_call_id ||
        new URL(req.url).searchParams.get("hcid") ||
        "";
      if (hagglCallId) {
        await finalizeCall(hagglCallId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[Vapi webhook] error:", err?.message);
    // Never fail the webhook — Vapi treats non-2xx as a delivery failure.
    return NextResponse.json({ ok: true });
  }
}
