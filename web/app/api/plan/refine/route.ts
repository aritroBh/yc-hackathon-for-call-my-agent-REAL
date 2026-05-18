import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { SourcingPlan } from "@/lib/types";
import { refineFallback } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You are the sourcing strategist for "haggl" refining an existing
plan from a buyer's instruction. Return ONLY JSON:

{ "plan": <the full updated SourcingPlan, same shape as given>, "reply": string }

The "reply" is ONE warm, concise sentence (no markdown) describing what you
changed, e.g. "Done — dropped the 3 Nigerian suppliers, kept Ghana. Updated
plan above." Keep every field well-typed. capUnit is a hard ceiling;
targetUnit stays below it. estSpend = round(targetUnit * units). Regions you
can reach: Nigeria (Yoruba), Ghana (Twi), India (Hindi). JSON only.`;

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json object");
  return JSON.parse(body.slice(start, end + 1));
}

/** Trust the model's plan only if it still looks like a SourcingPlan. */
function validPlan(p: unknown): p is SourcingPlan {
  if (!p || typeof p !== "object") return false;
  const x = p as Record<string, unknown>;
  return (
    Array.isArray(x.suppliers) &&
    x.suppliers.length > 0 &&
    typeof x.summary === "string" &&
    typeof x.budget === "object" &&
    x.budget !== null &&
    typeof (x.budget as Record<string, unknown>).capUnit === "number"
  );
}

export async function POST(req: Request) {
  let plan: SourcingPlan | null = null;
  let message = "";
  try {
    const body = await req.json();
    plan = body?.plan ?? null;
    message = typeof body?.message === "string" ? body.message : "";
  } catch {
    /* fall through */
  }
  if (!plan || typeof plan !== "object") {
    return NextResponse.json(
      { ok: false, error: "Missing current plan." },
      { status: 400 },
    );
  }

  const heuristic = refineFallback(plan, message);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !message.trim()) {
    return NextResponse.json(
      { ok: true, plan: heuristic.plan, reply: heuristic.reply },
      { status: 200 },
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Current plan:\n${JSON.stringify(
                plan,
              )}\n\nBuyer instruction: ${message}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM,
        temperature: 0.5,
        maxOutputTokens: 1400,
        responseMimeType: "application/json",
      },
    });

    const parsed = extractJson((response.text ?? "").trim()) as Record<
      string,
      unknown
    >;
    if (validPlan(parsed.plan)) {
      const nextPlan = parsed.plan as SourcingPlan;
      nextPlan.budget.estSpend = Math.round(
        nextPlan.budget.targetUnit * nextPlan.budget.units,
      );
      const reply =
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim()
          : heuristic.reply;
      return NextResponse.json({ ok: true, plan: nextPlan, reply }, { status: 200 });
    }
    return NextResponse.json(
      { ok: true, plan: heuristic.plan, reply: heuristic.reply },
      { status: 200 },
    );
  } catch (err) {
    console.error("[/api/plan/refine] Gemini error:", err);
    return NextResponse.json(
      { ok: true, plan: heuristic.plan, reply: heuristic.reply },
      { status: 200 },
    );
  }
}
