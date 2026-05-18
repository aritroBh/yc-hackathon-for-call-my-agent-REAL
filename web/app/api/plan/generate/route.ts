import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { OnboardingAnswers, SourcingPlan } from "@/lib/types";
import { buildFallbackPlan } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You are the sourcing strategist for "haggl". From a buyer's
onboarding brief you draft the plan your voice agents will run before any
calls are placed. You return ONLY JSON matching this TypeScript shape:

{
  "productLabel": string,           // lowercase noun phrase, e.g. "leather sandals"
  "summary": string,                // ONE sentence, first person, e.g. "I'll call 6 suppliers across Nigeria & Ghana in the next ~12 minutes, holding a $5.00/unit hard cap."
  "regions": string[],              // only from the buyer's regions
  "suppliers": [{ "name": string, "city": string, "countryCode": string, "country": string, "language": "Yoruba"|"Twi"|"Hindi"|"English" }],
  "estMinutes": number,
  "budget": { "targetUnit": number, "capUnit": number, "units": number, "estSpend": number },
  "callStrategy": { "mode": string, "order": string },
  "negotiation": string[],          // 3-4 short imperative bullets
  "priorityLabel": string
}

Rules: realistic supplier names/cities for the buyer's regions. Regions you
can reach: Nigeria (Yoruba), Ghana (Twi), India (Hindi). 4-6 suppliers.
capUnit must equal the buyer's max budget; targetUnit below it. Lead the
negotiation bullets with the buyer's stated priority. No markdown, JSON only.`;

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json object");
  return JSON.parse(body.slice(start, end + 1));
}

/** Keep a valid base plan; only let the model override well-typed fields. */
function mergePlan(base: SourcingPlan, model: unknown): SourcingPlan {
  if (!model || typeof model !== "object") return base;
  const m = model as Record<string, unknown>;
  const next: SourcingPlan = { ...base, budget: { ...base.budget } };

  if (typeof m.productLabel === "string" && m.productLabel.trim())
    next.productLabel = m.productLabel.trim();
  if (typeof m.summary === "string" && m.summary.trim())
    next.summary = m.summary.trim();
  if (typeof m.priorityLabel === "string" && m.priorityLabel.trim())
    next.priorityLabel = m.priorityLabel.trim();
  if (Array.isArray(m.regions) && m.regions.every((r) => typeof r === "string") && m.regions.length)
    next.regions = m.regions as string[];
  if (
    Array.isArray(m.suppliers) &&
    m.suppliers.length >= 3 &&
    m.suppliers.every(
      (s) => s && typeof s === "object" && typeof (s as Record<string, unknown>).name === "string",
    )
  ) {
    next.suppliers = (m.suppliers as Record<string, unknown>[]).slice(0, 6).map((s) => ({
      name: String(s.name),
      city: String(s.city ?? "—"),
      countryCode: String(s.countryCode ?? "—").toUpperCase().slice(0, 2),
      country: String(s.country ?? "—"),
      language: (["Yoruba", "Twi", "Hindi", "English"].includes(String(s.language))
        ? s.language
        : base.suppliers[0]?.language ?? "English") as SourcingPlan["suppliers"][number]["language"],
    }));
  }
  if (
    Array.isArray(m.negotiation) &&
    m.negotiation.every((b) => typeof b === "string") &&
    m.negotiation.length >= 3
  )
    next.negotiation = (m.negotiation as string[]).slice(0, 4);
  const mb = m.budget as Record<string, unknown> | undefined;
  if (mb && typeof mb === "object") {
    if (typeof mb.targetUnit === "number" && mb.targetUnit > 0)
      next.budget.targetUnit = mb.targetUnit;
    if (typeof mb.capUnit === "number" && mb.capUnit > 0)
      next.budget.capUnit = mb.capUnit;
  }
  if (typeof m.estMinutes === "number" && m.estMinutes > 0)
    next.estMinutes = Math.round(m.estMinutes);

  // Always re-derive spend so the card never contradicts itself.
  next.budget.estSpend = Math.round(next.budget.targetUnit * next.budget.units);
  return next;
}

export async function POST(req: Request) {
  let answers: OnboardingAnswers | null = null;
  try {
    const body = await req.json();
    answers = body?.answers ?? null;
  } catch {
    /* fall through */
  }
  if (!answers || typeof answers !== "object") {
    return NextResponse.json(
      { ok: false, error: "Missing onboarding answers." },
      { status: 400 },
    );
  }

  const fallback = buildFallbackPlan(answers);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, plan: fallback }, { status: 200 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: `Buyer brief:\n${JSON.stringify(answers, null, 2)}` }],
        },
      ],
      config: {
        systemInstruction: SYSTEM,
        temperature: 0.6,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
      },
    });
    const plan = mergePlan(fallback, extractJson((response.text ?? "").trim()));
    return NextResponse.json({ ok: true, plan }, { status: 200 });
  } catch (err) {
    console.error("[/api/plan/generate] Gemini error:", err);
    return NextResponse.json({ ok: true, plan: fallback }, { status: 200 });
  }
}
