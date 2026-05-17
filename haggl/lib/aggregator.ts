import { getCallById, getRFQById, getSupplierById, listCallsByRFQ, getDecryptedFloorPrice } from "@/lib/db";
import { sendPostCallEmail, sendBuyerPostCallEmail } from "@/lib/sponsors/agentmail";
import { storeNegotiationMemory } from "@/lib/sponsors/supermemory";
import { scoreSupplier, type ScoringContext } from "@/lib/scoring";

import { tables } from "@/lib/db";

const HAIKU_MODEL = "claude-3-5-haiku-20241022";
const EXTRACTION_TIMEOUT_MS = 8_000;

let _haikuApiKey: string | null = null;

function getHaikuKey(): string {
  if (!_haikuApiKey) {
    _haikuApiKey = process.env.ANTHROPIC_API_KEY || process.env.OPUS_API_KEY || null;
  }
  if (!_haikuApiKey) {
    throw new Error("ANTHROPIC_API_KEY or OPUS_API_KEY required for extraction");
  }
  return _haikuApiKey;
}

export interface CallExtraction {
  call_id: string;
  supplier_id: string;
  supplier_name: string;
  extracted_at: string;
  error?: string;
  outcome: string | null;
  quoted_price: number | null;
  currency: string;
  price_unit: string | null;
  lead_time_days: number | null;
  delivery_terms: string | null;
  certifications: string[];
  minimum_order_quantity: number | null;
  moq_unit: string | null;
  payment_terms: string | null;
  communication_quality: number | null;
  negotiation_effectiveness: number | null;
  confidence: number;
}

export interface ExtractionTask {
  callId: string;
  supplierId: string;
  supplierName: string;
  transcriptText: string;
  rfqContext: string;
}

const EXTRACTION_PROMPT = `You are a procurement data extraction specialist. Analyze the following sales negotiation transcript and extract structured information.

RFQ CONTEXT: {{rfqContext}}

TRANSCRIPT:
{{transcript}}

Return a JSON object with these exact fields:
{
  "outcome": string or null - short outcome summary like "quoted", "declined", or "follow_up_requested".
  "quoted_price": number or null - the final quoted price the supplier offered. If multiple prices mentioned, use the final agreed price. Extract bare number only.
  "currency": string - currency code (USD, INR, EUR, etc.). Default "USD" if not specified.
  "price_unit": string or null - e.g. "per kg", "per unit", "per ton", "per meter". Null if not specified.
  "lead_time_days": number or null - estimated delivery lead time in days. Convert weeks to days (1 week = 7 days), months to 30. Null if not mentioned.
  "delivery_terms": string or null - delivery terms like FOB, CIF, EXW, DDP, or any shipping arrangement mentioned.
  "certifications": array of strings - any certifications mentioned by the supplier (ISO, BIS, CE, RoHS, REACH, FDA, UL, etc.). Empty array if none.
  "minimum_order_quantity": number or null - MOQ mentioned by supplier. Null if not discussed.
  "moq_unit": string or null - unit for MOQ (kg, tons, units, meters, etc.). Null if MOQ not mentioned.
  "payment_terms": string or null - payment terms discussed (e.g. "Net 30", "Letter of Credit", "50% advance").
  "communication_quality": number 1-10 - rate the supplier's communication clarity, responsiveness, and professionalism.
  "negotiation_effectiveness": number 1-10 - rate how effective the negotiation was: did they engage, counter, compromise?
  "confidence": number 0.0-1.0 - how confident you are in the accuracy of this extraction.
}

Return ONLY valid JSON. No markdown fences. No explanation.`;

export async function extractCallData(task: ExtractionTask): Promise<CallExtraction> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

  try {
    const prompt = EXTRACTION_PROMPT
      .replace("{{rfqContext}}", task.rfqContext)
      .replace("{{transcript}}", task.transcriptText);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getHaikuKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Anthropic API ${response.status}: ${body}`);
    }

    const json = await response.json();
    const content: string = json.content?.[0]?.text;
    if (!content) throw new Error("Empty Haiku response");

    const parsed = parseExtraction(
      content,
      task.callId,
      task.supplierId,
      task.supplierName,
      Date.now() - startTime,
    );
    void triggerSponsorActions(task, parsed).catch(() => {});
    return parsed;
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout =
      err.name === "AbortError" || Date.now() - startTime >= EXTRACTION_TIMEOUT_MS;

    return {
      call_id: task.callId,
      supplier_id: task.supplierId,
      supplier_name: task.supplierName,
      extracted_at: new Date().toISOString(),
      error: isTimeout
        ? "extraction_timeout"
        : "extraction_failed: " + (err.message || String(err)),
      outcome: null,
      quoted_price: null,
      currency: "USD",
      price_unit: null,
      lead_time_days: null,
      delivery_terms: null,
      certifications: [],
      minimum_order_quantity: null,
      moq_unit: null,
      payment_terms: null,
      communication_quality: null,
      negotiation_effectiveness: null,
      confidence: 0,
    };
  }
}

function parseExtraction(
  raw: string,
  callId: string,
  supplierId: string,
  supplierName: string,
  _elapsedMs: number,
): CallExtraction {
  const base: CallExtraction = {
    call_id: callId,
    supplier_id: supplierId,
    supplier_name: supplierName,
    extracted_at: new Date().toISOString(),
    outcome: null,
    quoted_price: null,
    currency: "USD",
    price_unit: null,
    lead_time_days: null,
    delivery_terms: null,
    certifications: [],
    minimum_order_quantity: null,
    moq_unit: null,
    payment_terms: null,
    communication_quality: null,
    negotiation_effectiveness: null,
    confidence: 0,
  };

  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned);

    return {
      ...base,
      outcome: typeof parsed.outcome === "string" ? parsed.outcome : null,
      quoted_price:
        typeof parsed.quoted_price === "number"
          ? parsed.quoted_price
          : parsed.quoted_price != null
            ? Number(parsed.quoted_price)
            : null,
      currency:
        typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : "USD",
      price_unit: typeof parsed.price_unit === "string" ? parsed.price_unit : null,
      lead_time_days:
        typeof parsed.lead_time_days === "number"
          ? parsed.lead_time_days
          : parsed.lead_time_days != null
            ? Number(parsed.lead_time_days)
            : null,
      delivery_terms:
        typeof parsed.delivery_terms === "string" ? parsed.delivery_terms : null,
      certifications: Array.isArray(parsed.certifications)
        ? parsed.certifications.filter((c: unknown): c is string => typeof c === "string")
        : [],
      minimum_order_quantity:
        typeof parsed.minimum_order_quantity === "number"
          ? parsed.minimum_order_quantity
          : parsed.minimum_order_quantity != null
            ? Number(parsed.minimum_order_quantity)
            : null,
      moq_unit: typeof parsed.moq_unit === "string" ? parsed.moq_unit : null,
      payment_terms:
        typeof parsed.payment_terms === "string" ? parsed.payment_terms : null,
      communication_quality:
        typeof parsed.communication_quality === "number"
          ? parsed.communication_quality
          : null,
      negotiation_effectiveness:
        typeof parsed.negotiation_effectiveness === "number"
          ? parsed.negotiation_effectiveness
          : null,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0,
      error: undefined,
    };
  } catch {
    return { ...base, error: "parse_failed: invalid JSON from Haiku" };
  }
}

async function hasRecentSponsorDispatch(callId: string): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  // Note: in Supabase/PostgREST, we can filter JSONB properties natively
  const { data } = await tables.reasoning_traces
    .select("id")
    .eq("input_data->>call_id", callId)
    .gte("created_at", twentyFourHoursAgo)
    .limit(1);

  return !!data && data.length > 0;
}

function normalizeOutcome(
  extraction: CallExtraction,
  callResult: Record<string, unknown> | null,
): string {
  if (extraction.outcome && extraction.outcome.trim()) {
    return extraction.outcome.trim();
  }

  const structuredOffer = callResult?.structured_offer;
  if (structuredOffer && typeof structuredOffer === "object") {
    const outcome = (structuredOffer as Record<string, unknown>).outcome;
    if (typeof outcome === "string" && outcome.trim()) {
      return outcome.trim();
    }
  }

  return extraction.quoted_price != null ? "quoted" : "completed";
}

async function triggerSponsorActions(
  task: ExtractionTask,
  extraction: CallExtraction,
): Promise<void> {
  if (extraction.error || await hasRecentSponsorDispatch(task.callId)) return;

  const [call, supplier] = await Promise.all([
    getCallById(task.callId),
    getSupplierById(task.supplierId),
  ]);
  if (!call || call.status !== "completed" || !supplier) return;

  const rfq = await getRFQById(call.rfq_id);
  if (!rfq) return;

  // Inserting a trace here to serve as the idempotency mark for hasRecentSponsorDispatch
  await tables.reasoning_traces.insert({
    call_id: task.callId,
    trace_type: 'function_call',
    provider: 'system',
    input_data: { call_id: task.callId, action: 'sponsor_dispatch' },
    output_data: { success: true }
  });

  const metadata =
    supplier.metadata && typeof supplier.metadata === "object"
      ? (supplier.metadata as Record<string, unknown>)
      : null;
  const region = typeof metadata?.region === "string" ? metadata.region : "";
  const quantity =
    Array.isArray(rfq.items) && rfq.items.length > 0
      ? Number(rfq.items[0]?.quantity || 0)
      : 0;
  const outcome = normalizeOutcome(
    extraction,
    call.result as Record<string, unknown> | null,
  );

  // Load target/floor prices
  const floorPrice = await getDecryptedFloorPrice(call.rfq_id);
  const ctx: ScoringContext = {
    targetPrice: rfq.target_price,
    floorPrice,
    targetLeadDays: null,
  };

  // Compute this supplier's score
  const scoredSup = scoreSupplier(supplier.id, supplier.name, extraction, ctx);

  // Construct the suppliers list for the buyer email
  // Let's query all calls for this RFQ
  const callsForRfq = await listCallsByRFQ(call.rfq_id);
  
  const scoredList: {
    name: string;
    quotedPrice: number | null;
    leadTimeDays: number | null;
    outcome: string;
    compositeScore?: number;
    rank?: number;
  }[] = [];

  // Add the current supplier to the list (using the freshly computed extraction)
  scoredList.push({
    name: supplier.name,
    quotedPrice: extraction.quoted_price,
    leadTimeDays: extraction.lead_time_days,
    outcome,
    compositeScore: scoredSup.composite_score,
  });

  // Add all other completed calls
  for (const c of callsForRfq) {
    if (c.id === call.id) continue;
    if (c.status === "completed" && c.result) {
      try {
        const otherSup = await getSupplierById(c.supplier_id);
        if (otherSup) {
          const otherExt = c.result as any;
          if (otherExt.quoted_price != null) {
            const otherScored = scoreSupplier(otherSup.id, otherSup.name, otherExt, ctx);
            scoredList.push({
              name: otherSup.name,
              quotedPrice: otherExt.quoted_price,
              leadTimeDays: otherExt.lead_time_days,
              outcome: normalizeOutcome(otherExt, c.result),
              compositeScore: otherScored.composite_score,
            });
          }
        }
      } catch {}
    }
  }

  // Sort and assign ranks
  scoredList.sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));
  scoredList.forEach((item, index) => {
    item.rank = index + 1;
  });

  // Find current supplier's rank and score
  const currentRanked = scoredList.find(s => s.name === supplier.name);
  const compositeScore = currentRanked?.compositeScore || scoredSup.composite_score;
  const rank = currentRanked?.rank || 1;

  const work: Promise<unknown>[] = [
    storeNegotiationMemory({
      supplierName: supplier.name,
      region,
      outcome,
      quotedPrice: extraction.quoted_price,
      leadTimeDays: extraction.lead_time_days,
      certifications: extraction.certifications || [],
      callId: task.callId,
    }),
    sendBuyerPostCallEmail({
      rfqTitle: rfq.title,
      rfqId: rfq.id,
      partName: rfq.title,
      quantity,
      suppliers: scoredList,
    })
  ];

  if (supplier.email) {
    work.push(
      sendPostCallEmail({
        toEmail: supplier.email,
        toName: supplier.contact_name || supplier.name,
        partName: rfq.title,
        quantity,
        quotedPrice: extraction.quoted_price,
        leadTimeDays: extraction.lead_time_days,
        outcome,
        callId: task.callId,
        rfqId: rfq.id,
        compositeScore,
        rank,
      }),
    );
  }

  await Promise.allSettled(work);
}



export function buildTranscriptText(
  transcript: { role: string; content: string; timestamp?: string }[],
  maxChars = 12_000,
): string {
  if (!transcript || transcript.length === 0) {
    return "[No transcript available]";
  }

  let result = "";
  for (const entry of transcript) {
    const label =
      entry.role === "agent"
        ? "AGENT"
        : entry.role === "supplier"
          ? "SUPPLIER"
          : "SYSTEM";
    const line = `[${label}] ${entry.content}\n`;
    if (result.length + line.length > maxChars) {
      result += "... [transcript truncated]";
      break;
    }
    result += line;
  }

  return result || "[Empty transcript]";
}
