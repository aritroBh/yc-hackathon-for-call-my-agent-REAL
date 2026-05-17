const HAIKU_MODEL = "claude-3-5-haiku-20241022";
const EXTRACTION_TIMEOUT_MS = 8_000;

let _haikuApiKey: string | null = null;

function getHaikuKey(): string {
  if (!_haikuApiKey) {
    _haikuApiKey = process.env.ANTHROPIC_API_KEY || process.env.OPUS_API_KEY || null;
  }
  if (!_haikuApiKey) throw new Error("ANTHROPIC_API_KEY or OPUS_API_KEY required for extraction");
  return _haikuApiKey;
}

export interface CallExtraction {
  call_id: string;
  supplier_id: string;
  supplier_name: string;
  extracted_at: string;
  error?: string;

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
  "quoted_price": number or null — the final quoted price the supplier offered. If multiple prices mentioned, use the final agreed price. Extract bare number only.
  "currency": string — currency code (USD, INR, EUR, etc.). Default "USD" if not specified.
  "price_unit": string or null — e.g. "per kg", "per unit", "per ton", "per meter". Null if not specified.
  "lead_time_days": number or null — estimated delivery lead time in days. Convert weeks to days (1 week = 7 days), months to 30. Null if not mentioned.
  "delivery_terms": string or null — delivery terms like FOB, CIF, EXW, DDP, or any shipping arrangement mentioned.
  "certifications": array of strings — any certifications mentioned by the supplier (ISO, BIS, CE, RoHS, REACH, FDA, UL, etc.). Empty array if none.
  "minimum_order_quantity": number or null — MOQ mentioned by supplier. Null if not discussed.
  "moq_unit": string or null — unit for MOQ (kg, tons, units, meters, etc.). Null if MOQ not mentioned.
  "payment_terms": string or null — payment terms discussed (e.g. "Net 30", "Letter of Credit", "50% advance").
  "communication_quality": number 1-10 — rate the supplier's communication clarity, responsiveness, and professionalism.
  "negotiation_effectiveness": number 1-10 — rate how effective the negotiation was: did they engage, counter, compromise?
  "confidence": number 0.0-1.0 — how confident you are in the accuracy of this extraction.

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

    return parseExtraction(content, task.callId, task.supplierId, task.supplierName, Date.now() - startTime);
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === "AbortError" || (Date.now() - startTime) >= EXTRACTION_TIMEOUT_MS;

    return {
      call_id: task.callId,
      supplier_id: task.supplierId,
      supplier_name: task.supplierName,
      extracted_at: new Date().toISOString(),
      error: isTimeout ? "extraction_timeout" : "extraction_failed: " + (err.message || String(err)),
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
  elapsedMs: number,
): CallExtraction {
  const base: CallExtraction = {
    call_id: callId,
    supplier_id: supplierId,
    supplier_name: supplierName,
    extracted_at: new Date().toISOString(),
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
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned);

    return {
      ...base,
      quoted_price: typeof parsed.quoted_price === "number" ? parsed.quoted_price : (parsed.quoted_price != null ? Number(parsed.quoted_price) : null),
      currency: typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : "USD",
      price_unit: typeof parsed.price_unit === "string" ? parsed.price_unit : null,
      lead_time_days: typeof parsed.lead_time_days === "number" ? parsed.lead_time_days : (parsed.lead_time_days != null ? Number(parsed.lead_time_days) : null),
      delivery_terms: typeof parsed.delivery_terms === "string" ? parsed.delivery_terms : null,
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications.filter((c: any) => typeof c === "string") : [],
      minimum_order_quantity: typeof parsed.minimum_order_quantity === "number" ? parsed.minimum_order_quantity : (parsed.minimum_order_quantity != null ? Number(parsed.minimum_order_quantity) : null),
      moq_unit: typeof parsed.moq_unit === "string" ? parsed.moq_unit : null,
      payment_terms: typeof parsed.payment_terms === "string" ? parsed.payment_terms : null,
      communication_quality: typeof parsed.communication_quality === "number" ? parsed.communication_quality : null,
      negotiation_effectiveness: typeof parsed.negotiation_effectiveness === "number" ? parsed.negotiation_effectiveness : null,
      confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0,
      error: undefined,
    };
  } catch {
    return { ...base, error: "parse_failed: invalid JSON from Haiku" };
  }
}

const EXTRACTION_CACHE_TTL_MS = 60_000;
const extractionCache = new Map<string, { result: CallExtraction; ts: number }>();

export function getCachedExtraction(key: string): CallExtraction | null {
  const entry = extractionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > EXTRACTION_CACHE_TTL_MS) {
    extractionCache.delete(key);
    return null;
  }
  return entry.result;
}

export function setCachedExtraction(key: string, result: CallExtraction): void {
  if (extractionCache.size > 100) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    extractionCache.forEach((entry, k) => {
      if (entry.ts < oldestTs) {
        oldestTs = entry.ts;
        oldestKey = k;
      }
    });
    if (oldestKey) extractionCache.delete(oldestKey);
  }
  extractionCache.set(key, { result, ts: Date.now() });
}

export function clearExtractionCache(): void {
  extractionCache.clear();
}

export function buildTranscriptText(
  transcript: { role: string; content: string; timestamp?: string }[],
  maxChars = 12_000,
): string {
  if (!transcript || transcript.length === 0) return "[No transcript available]";

  let result = "";
  for (const entry of transcript) {
    const label = entry.role === "agent" ? "AGENT" : entry.role === "supplier" ? "SUPPLIER" : "SYSTEM";
    const line = `[${label}] ${entry.content}\n`;
    if (result.length + line.length > maxChars) {
      result += "... [transcript truncated]";
      break;
    }
    result += line;
  }

  return result || "[Empty transcript]";
}
