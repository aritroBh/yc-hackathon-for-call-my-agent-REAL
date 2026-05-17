import { type CallExtraction } from "@/lib/aggregator";

let _opusKey: string | null = null;
function getOpusKey(): string {
  if (!_opusKey) _opusKey = process.env.ANTHROPIC_API_KEY || process.env.OPUS_API_KEY || null;
  if (!_opusKey) throw new Error("ANTHROPIC_API_KEY or OPUS_API_KEY required for pattern extraction");
  return _opusKey;
}

const OPUS_MODEL = "claude-opus-4-5-20250514";
const EXTRACTION_TIMEOUT_MS = 15_000;

export interface NegotiationPatterns {
  call_id: string;
  supplier_id: string;
  supplier_name: string;
  region: string | null;
  dialect_locale: string | null;
  successful_rebuttals: PatternEntry[];
  successful_openers: PatternEntry[];
  concession_effectiveness: ConcessionEntry[];
  region_specific_wins: RegionWin[];
  failed_approaches: FailureEntry[];
  overall_score: number;
  key_learnings: string[];
}

export interface PatternEntry {
  text: string;
  effectiveness: number;
  context: string;
  category: string;
}

export interface ConcessionEntry {
  offer: string;
  concession_made: string;
  outcome: string;
  effectiveness: number;
}

export interface RegionWin {
  region: string;
  technique: string;
  description: string;
  success_rate: number;
}

export interface FailureEntry {
  approach: string;
  result: string;
  reason: string;
  category: string;
}

export interface PatternInput {
  callId: string;
  supplierId: string;
  supplierName: string;
  region: string | null;
  dialectLocale: string | null;
  transcriptText: string;
  extraction: CallExtraction | null;
  extractionError?: string;
  feedbackRating: number | null;
  feedbackComment: string | null;
}

const PATTERN_EXTRACTION_PROMPT = `You are a procurement negotiation analyst. Analyze this completed negotiation transcript and extract patterns for reinforcement learning.

SUPPLIER: {{supplierName}}
REGION: {{region}}
DIALECT: {{dialectLocale}}
TRANSCRIPT:
{{transcript}}

EXTRACTION:
- Quoted Price: {{quotedPrice}}
- Lead Time: {{leadTimeDays}} days
- Certifications: {{certifications}}
- MOQ: {{moq}}
- Communication Quality: {{commQuality}}/10
- Negotiation Effectiveness: {{negEffectiveness}}/10
- Extraction Confidence: {{extractionConfidence}}

FEEDBACK:
- Rating: {{feedbackRating}}/5
- Comment: "{{feedbackComment}}"

Analyze this negotiation and return a JSON object with exactly these fields:

{
  "successful_rebuttals": [
    {
      "text": "the exact rebuttal phrase or approach used by the agent",
      "effectiveness": 0.0-1.0,
      "context": "what the supplier claimed that triggered this rebuttal",
      "category": "price|quality|delivery|certification|moq|regulation|shipping|general"
    }
  ],
  "successful_openers": [
    {
      "text": "the opening statement or approach",
      "effectiveness": 0.0-1.0,
      "context": "how the supplier responded to this opener",
      "category": "greeting|disclosure|first_offer|relationship|direct"
    }
  ],
  "concession_effectiveness": [
    {
      "offer": "what the agent offered (volume increase, flexibility, etc.)",
      "concession_made": "what the supplier conceded",
      "outcome": "the result of this exchange",
      "effectiveness": 0.0-1.0
    }
  ],
  "region_specific_wins": [
    {
      "region": "the supplier's region",
      "technique": "the approach that worked well",
      "description": "why it was effective in this cultural context",
      "success_rate": 0.0-1.0
    }
  ],
  "failed_approaches": [
    {
      "approach": "what was tried",
      "result": "what happened",
      "reason": "why it failed",
      "category": "price|quality|delivery|certification|moq|regulation|shipping|general"
    }
  ],
  "overall_score": 0-100,
  "key_learnings": ["specific actionable learning statements"]
}

Return ONLY valid JSON. No markdown fences.`;

const FAILURE_PATTERN_PROMPT = `You are a procurement negotiation post-mortem analyst. This call was rated poorly and/or had negative outcomes. Analyze failures for improvement.

SUPPLIER: {{supplierName}}
REGION: {{region}}
DIALECT: {{dialectLocale}}
TRANSCRIPT:
{{transcript}}

EXTRACTION ERROR: {{extractionError}}
FEEDBACK RATING: {{feedbackRating}}/5
FEEDBACK: "{{feedbackComment}}"

Return a JSON object with these exact fields:

{
  "failed_approaches": [
    {
      "approach": "what was tried",
      "result": "what happened",
      "reason": "root cause of failure",
      "category": "price|quality|delivery|certification|moq|regulation|shipping|general"
    }
  ],
  "root_causes": ["list of root cause statements"],
  "recommended_changes": ["specific changes to negotiation strategy or dialect config"],
  "overall_score": 0-100
}

Return ONLY valid JSON. No markdown fences.`;

export async function extractNegotiationPatterns(
  input: PatternInput,
): Promise<NegotiationPatterns> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

  const isFailure = (input.extractionError != null || (input.feedbackRating != null && input.feedbackRating <= 2))
    && !input.extraction;

  try {
    const prompt = (isFailure ? FAILURE_PATTERN_PROMPT : PATTERN_EXTRACTION_PROMPT)
      .replace("{{supplierName}}", input.supplierName)
      .replace("{{region}}", input.region || "Unknown")
      .replace("{{dialectLocale}}", input.dialectLocale || "Unknown")
      .replace("{{transcript}}", input.transcriptText)
      .replace("{{quotedPrice}}", input.extraction?.quoted_price != null ? String(input.extraction.quoted_price) : "N/A")
      .replace("{{leadTimeDays}}", input.extraction?.lead_time_days != null ? String(input.extraction.lead_time_days) : "N/A")
      .replace("{{certifications}}", input.extraction?.certifications?.join(", ") || "N/A")
      .replace("{{moq}}", input.extraction?.minimum_order_quantity != null ? String(input.extraction.minimum_order_quantity) : "N/A")
      .replace("{{commQuality}}", input.extraction?.communication_quality != null ? String(input.extraction.communication_quality) : "N/A")
      .replace("{{negEffectiveness}}", input.extraction?.negotiation_effectiveness != null ? String(input.extraction.negotiation_effectiveness) : "N/A")
      .replace("{{extractionConfidence}}", input.extraction?.confidence != null ? String(input.extraction.confidence) : "N/A")
      .replace("{{feedbackRating}}", input.feedbackRating != null ? String(input.feedbackRating) : "N/A")
      .replace("{{feedbackComment}}", input.feedbackComment || "")
      .replace("{{extractionError}}", input.extractionError || "None");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getOpusKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: OPUS_MODEL,
        max_tokens: 2048,
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
    if (!content) throw new Error("Empty Opus response");

    return parsePatterns(content, input);
  } catch (err: any) {
    clearTimeout(timeoutId);

    return {
      call_id: input.callId,
      supplier_id: input.supplierId,
      supplier_name: input.supplierName,
      region: input.region,
      dialect_locale: input.dialectLocale,
      successful_rebuttals: [],
      successful_openers: [],
      concession_effectiveness: [],
      region_specific_wins: [],
      failed_approaches: [{ approach: "analysis_failed", result: err.message || "Unknown error", reason: "pattern_extraction_error", category: "general" }],
      overall_score: 0,
      key_learnings: ["Pattern extraction failed: " + (err.message || "Unknown")],
    };
  }
}

function parsePatterns(raw: string, input: PatternInput): NegotiationPatterns {
  const base = {
    call_id: input.callId,
    supplier_id: input.supplierId,
    supplier_name: input.supplierName,
    region: input.region,
    dialect_locale: input.dialectLocale,
    successful_rebuttals: [] as PatternEntry[],
    successful_openers: [] as PatternEntry[],
    concession_effectiveness: [] as ConcessionEntry[],
    region_specific_wins: [] as RegionWin[],
    failed_approaches: [] as FailureEntry[],
    overall_score: 50,
    key_learnings: [] as string[],
  };

  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned);

    return {
      ...base,
      successful_rebuttals: Array.isArray(parsed.successful_rebuttals) ? parsed.successful_rebuttals.map(normalizeEntry) : [],
      successful_openers: Array.isArray(parsed.successful_openers) ? parsed.successful_openers.map(normalizeEntry) : [],
      concession_effectiveness: Array.isArray(parsed.concession_effectiveness) ? parsed.concession_effectiveness.map(normalizeConcession) : [],
      region_specific_wins: Array.isArray(parsed.region_specific_wins) ? parsed.region_specific_wins.map(normalizeRegionWin) : [],
      failed_approaches: Array.isArray(parsed.failed_approaches) ? parsed.failed_approaches.map(normalizeFailure) : (Array.isArray(parsed.root_causes) ? parsed.root_causes.map((rc: string) => ({ approach: "general", result: rc, reason: rc, category: "general" })) : []),
      overall_score: typeof parsed.overall_score === "number" ? Math.min(100, Math.max(0, parsed.overall_score)) : 50,
      key_learnings: Array.isArray(parsed.key_learnings) ? parsed.key_learnings.filter((l: any) => typeof l === "string") : (Array.isArray(parsed.recommended_changes) ? parsed.recommended_changes : []),
    };
  } catch {
    return base;
  }
}

function normalizeEntry(e: any): PatternEntry {
  return {
    text: typeof e.text === "string" ? e.text : "",
    effectiveness: typeof e.effectiveness === "number" ? Math.min(1, Math.max(0, e.effectiveness)) : 0.5,
    context: typeof e.context === "string" ? e.context : "",
    category: typeof e.category === "string" ? e.category : "general",
  };
}

function normalizeConcession(e: any): ConcessionEntry {
  return {
    offer: typeof e.offer === "string" ? e.offer : "",
    concession_made: typeof e.concession_made === "string" ? e.concession_made : "",
    outcome: typeof e.outcome === "string" ? e.outcome : "",
    effectiveness: typeof e.effectiveness === "number" ? Math.min(1, Math.max(0, e.effectiveness)) : 0.5,
  };
}

function normalizeRegionWin(e: any): RegionWin {
  return {
    region: typeof e.region === "string" ? e.region : "Unknown",
    technique: typeof e.technique === "string" ? e.technique : "",
    description: typeof e.description === "string" ? e.description : "",
    success_rate: typeof e.success_rate === "number" ? Math.min(1, Math.max(0, e.success_rate)) : 0.5,
  };
}

function normalizeFailure(e: any): FailureEntry {
  return {
    approach: typeof e.approach === "string" ? e.approach : "",
    result: typeof e.result === "string" ? e.result : "",
    reason: typeof e.reason === "string" ? e.reason : "",
    category: typeof e.category === "string" ? e.category : "general",
  };
}

export function computeActualSavings(
  targetPrice: number | null,
  floorPrice: number | null,
  quotedPrice: number | null,
): { savings_vs_target: number | null; savings_vs_floor: number | null; savings_pct: number | null } {
  if (quotedPrice == null) return { savings_vs_target: null, savings_vs_floor: null, savings_pct: null };

  const savingsVsTarget = targetPrice != null ? Math.max(0, targetPrice - quotedPrice) : null;
  const savingsVsFloor = floorPrice != null ? Math.max(0, floorPrice - quotedPrice) : null;
  const savingsPct = targetPrice != null && targetPrice > 0
    ? Math.round((savingsVsTarget! / targetPrice) * 10000) / 100
    : null;

  return { savings_vs_target: savingsVsTarget, savings_vs_floor: savingsVsFloor, savings_pct: savingsPct };
}

export function updateDialectPrompt(
  existingPrompt: string,
  patterns: NegotiationPatterns,
  approach: "reinforce" | "correct",
): string {
  const sections: string[] = [existingPrompt];

  if (approach === "reinforce" && patterns.successful_rebuttals.length > 0) {
    const top = patterns.successful_rebuttals
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 3);
    sections.push(
      "",
      "=== RL-OPTIMIZED REBUTTALS ===",
      "The following rebuttal approaches have been effective with suppliers in this region:",
      ...top.map((r, i) => `${i + 1}. [${r.category}] "${r.text}" — effective in context: ${r.context}`),
    );
  }

  if (approach === "reinforce" && patterns.successful_openers.length > 0) {
    const top = patterns.successful_openers
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 2);
    sections.push(
      "",
      "=== RL-OPTIMIZED OPENERS ===",
      "High-performing opening approaches for this region:",
      ...top.map((o, i) => `${i + 1}. [${o.category}] "${o.text}"`),
    );
  }

  if (approach === "reinforce" && patterns.region_specific_wins.length > 0) {
    sections.push(
      "",
      "=== REGION-SPECIFIC INSIGHTS ===",
      ...patterns.region_specific_wins.map(
        (w) => `- ${w.technique}: ${w.description} (${Math.round(w.success_rate * 100)}% success)`,
      ),
    );
  }

  if (approach === "correct" && patterns.failed_approaches.length > 0) {
    const top = patterns.failed_approaches.slice(0, 3);
    sections.push(
      "",
      "=== APPROACHES TO AVOID ===",
      "The following approaches have been ineffective or counterproductive:",
      ...top.map((f, i) => `${i + 1}. [${f.category}] "${f.approach}" — failed because: ${f.reason}`),
    );
  }

  if (patterns.key_learnings.length > 0) {
    sections.push(
      "",
      "=== RL KEY LEARNINGS ===",
      ...patterns.key_learnings.map((l) => `- ${l}`),
    );
  }

  const maxLen = 6000;
  let result = sections.join("\n");
  if (result.length > maxLen) {
    result = result.slice(0, maxLen) + "\n... [RL section truncated]";
  }

  return result;
}
