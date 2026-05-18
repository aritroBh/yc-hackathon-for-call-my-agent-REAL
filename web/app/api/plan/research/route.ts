/**
 * POST /api/plan/research
 *
 * Phase 2 of the two-phase plan flow. The quick Gemini-flash plan is
 * already on screen (via /api/plan/generate); this kicks off the *real*
 * Gemini Deep Research in haggl (the headless backend) and streams its
 * SSE straight back to the browser. The plan canvas swaps the seeded
 * suppliers for the researched ones when `suppliers_found` arrives.
 *
 * haggl owns the long orchestration (plan → approve → execute → persist)
 * behind a single `action: "research"` call, so this proxy just forwards
 * one connection and keeps HAGGL_API_URL server-side (no CORS).
 */
import type { OnboardingAnswers } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // hint only; deep research can run longer locally

const HAGGL_API_URL = process.env.HAGGL_API_URL || "http://localhost:3000";

/** Turn the onboarding brief into the RFQ fields haggl's research prompt expects. */
function rfqFromAnswers(a: OnboardingAnswers): {
  rfq_title: string;
  rfq_description: string;
  items: string;
} {
  const product = (a.product || a.category || "goods").trim();
  const regions = (a.regions ?? []).join(", ") || "West Africa, India";
  const units = a.units || 500;
  const lo = a.budgetMin || 0;
  const hi = a.budgetMax || a.budgetMin || 0;
  const priority = (a.priority || "lowest-price").replace(/-/g, " ");

  return {
    rfq_title: product,
    rfq_description:
      `US buyer sourcing ${units.toLocaleString("en-US")} units of ${product}` +
      ` (category: ${a.category || product}).` +
      ` Budget $${lo}–$${hi} per unit. Preferred regions: ${regions}.` +
      ` Buyer priority: ${priority}.`,
    items: `${units.toLocaleString("en-US")} units of ${product}`,
  };
}

export async function POST(req: Request): Promise<Response> {
  let answers: OnboardingAnswers | null = null;
  try {
    const body = await req.json();
    answers = body?.answers ?? null;
  } catch {
    /* fall through */
  }
  if (!answers || typeof answers !== "object") {
    return Response.json(
      { ok: false, error: "Missing onboarding answers." },
      { status: 400 },
    );
  }

  const { rfq_title, rfq_description, items } = rfqFromAnswers(answers);

  let upstream: Response;
  try {
    upstream = await fetch(`${HAGGL_API_URL}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "research",
        rfq_title,
        rfq_description,
        items,
      }),
    });
  } catch (err) {
    console.error("[/api/plan/research] haggl unreachable:", err);
    return Response.json(
      {
        ok: false,
        error: `Could not reach the research backend at ${HAGGL_API_URL}. Is haggl running?`,
      },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("[/api/plan/research] haggl error:", upstream.status, detail);
    return Response.json(
      { ok: false, error: `Research backend returned ${upstream.status}.` },
      { status: 502 },
    );
  }

  // Pass the SSE stream straight through to the browser.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
