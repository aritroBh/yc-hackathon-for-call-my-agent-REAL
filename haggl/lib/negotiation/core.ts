/**
 * Negotiation core — provider-agnostic.
 *
 * This is the haggl negotiation brain (Gemini), extracted out of the old
 * AgentPhone webhook so it can be driven by the Vapi custom-LLM adapter
 * (app/api/vapi/llm/chat/completions/route.ts). No Next.js Request/Response
 * coupling lives here.
 */
import { GoogleGenAI } from "@google/genai";
import {
  tables,
  getCallById,
  getRFQById,
  getSupplierById,
} from "@/lib/db";
import { getDialectByLocale } from "@/lib/prompts/dialectPrompts";
import { buildNegotiationPrompt } from "@/lib/promptBuilder";
import { shouldTrigger } from "@/lib/triggerDetection";
import { searchMossForContext } from "@/lib/sponsors/moss";
import { getSupplierMemory, getLanguageContext } from "@/lib/sponsors/supermemory";
import { emitDashboard } from "@/lib/serverSocket";
import { getCallQueue } from "@/lib/queue";
import { getDispatcher } from "@/lib/dispatcher";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

export function getLocaleForLanguage(lang: string | unknown): string {
  if (typeof lang !== "string") return "en-US";
  const clean = lang.toLowerCase().trim();
  if (clean === "twi" || clean === "akan" || clean === "tw-gh") return "tw-GH";
  if (clean === "yoruba" || clean === "yo-ng") return "yo-NG";
  return "en-US";
}

export async function saveTranscriptTurn(
  callId: string,
  content: string,
  role: "agent" | "supplier" | "system"
): Promise<void> {
  try {
    const { data: callData } = await tables.calls
      .select("transcript")
      .eq("id", callId)
      .single();
    if (callData) {
      const transcript = (callData.transcript as any[]) || [];
      transcript.push({
        role,
        content,
        timestamp: new Date().toISOString(),
      });
      await tables.calls.update({ transcript }).eq("id", callId);
    }
  } catch (err: any) {
    console.error("[saveTranscriptTurn] Failed to save transcript turn:", err.message);
  }
}

export async function buildIntelContext(
  supplierText: string,
  callId: string,
  supplier: any
): Promise<string> {
  if (!supplier || !shouldTrigger(supplierText)) return "";

  try {
    const triggerText = supplierText;
    const start = Date.now();

    // 1. Moss Semantic Search
    const mossContext = await searchMossForContext(triggerText);
    const mossFactsStr =
      mossContext?.facts && mossContext.facts.length > 0
        ? mossContext.facts.map((f: string) => `- ${f}`).join("\n")
        : "";

    // 2. Supermemory
    const supplierRegion = supplier.metadata?.region || "US East";
    const memories = await getSupplierMemory(supplier.name, supplierRegion);
    const locale = getLocaleForLanguage(supplier?.metadata?.language || "english");
    const langContext = await getLanguageContext(locale);

    // 3. Pre-call Browser Use research
    let preCallResearch = "";
    if (callId) {
      const { data: callData } = await tables.calls
        .select("result")
        .eq("id", callId)
        .single();
      if (callData?.result?.pre_call_research) {
        preCallResearch = JSON.stringify(callData.result.pre_call_research, null, 2);
      }
    }

    const prompt = `You are a procurement intelligence analyst supporting a live negotiation call.

VERIFIED MARKET FACTS (from Moss semantic search):
${mossFactsStr || "None available"}

LANGUAGE & CULTURAL INTELLIGENCE (from Supermemory):
${langContext || "No language context available"}

HISTORICAL SUPPLIER INTELLIGENCE (from past negotiations):
${memories || "No prior negotiations on record"}

PRE-CALL RESEARCH (Browser Use):
${preCallResearch || "None available"}

The supplier just claimed: "${triggerText}"

Analyze whether this claim is accurate. Provide a counter-position the agent can use immediately.
Respond in JSON only, no markdown fences:
{
  "rebuttal_context": "one sentence the agent can use right now",
  "facts": "specific market fact that challenges this claim, or null if unknown",
  "suggested_position": "exact counter-position for the agent to take",
  "confidence": "high|medium|low"
}`;

    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { maxOutputTokens: 300 },
    });

    const rawText = response.text ?? "";
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    const intelBlock = `
[LIVE INTEL]
Context: ${parsed.rebuttal_context}
Facts: ${parsed.facts || "None"}
Rebuttal: ${parsed.suggested_position}
Position: ${parsed.suggested_position}
Confidence: ${parsed.confidence}
[/LIVE INTEL]
`;

    const outputData = {
      rebuttal_context: parsed.rebuttal_context,
      facts: parsed.facts,
      suggested_position: parsed.suggested_position,
      confidence: parsed.confidence,
      injected_text: intelBlock,
      moss_facts: mossContext?.facts || [],
      supermemory_context: memories || null,
    };

    await tables.reasoning_traces.insert({
      call_id: callId,
      trace_type: "live_intel_injection",
      provider: "claude",
      phase: "negotiating",
      input_data: {
        call_id: callId,
        supplier_turn: triggerText,
      },
      output_data: outputData,
      tokens_used: null,
      latency_ms: Date.now() - start,
    });

    emitDashboard("reasoning_trace", {
      callId,
      traceType: "live_intel_injection",
      data: outputData,
      category: "general",
      confidence: parsed.confidence === "high" ? 0.9 : parsed.confidence === "medium" ? 0.5 : 0.2,
      claim: triggerText,
      timestamp: new Date().toISOString(),
    });

    return intelBlock;
  } catch (err: any) {
    console.warn("[Negotiation] Intel extraction failed:", err.message);
    return "";
  }
}

export function buildNegotiationPromptForLanguage(
  rfq: any,
  supplier: any,
  dialectContext: any,
  intelContext: string
): string {
  const builderOutput = buildNegotiationPrompt({
    rfq: {
      title: rfq.title,
      description: rfq.description,
      items: rfq.items,
      target_price: rfq.target_price,
      floor_price: rfq.floor_price,
      currency: rfq.currency || "USD",
      deadline: rfq.deadline,
    },
    supplier: {
      name: supplier.name,
      contact_name: supplier.contact_name,
      phone: supplier.phone,
      email: supplier.email,
      metadata: supplier.metadata || {},
    },
    dialectConfig: dialectContext
      ? {
          name: dialectContext.name,
          locale: dialectContext.locale,
          prompt_template: "",
          speaking_style: dialectContext.communicationStyle,
          cultural_notes: dialectContext.culturalNotes || "",
          formality_level: dialectContext.formalityLevel,
          greeting_phrase: dialectContext.greetingPhrase,
          closing_phrase: dialectContext.closingPhrase,
        }
      : null,
    aggressiveness: "medium",
    priority: "balanced",
    aiDisclosure: true,
  });

  let prompt = builderOutput.systemPrompt;
  if (dialectContext?.locale === "tw-GH" || dialectContext?.locale === "yo-NG") {
    const languageName = dialectContext.locale === "tw-GH" ? "Twi / Akan" : "Yoruba";
    prompt =
      `LANGUAGE INSTRUCTION: You MUST speak exclusively in ${languageName} throughout this call.
Do not translate to English. Do not code-switch unless the supplier does first.
Use natural, fluent ${languageName} including idioms, proverbs, and culturally appropriate phrases.
Your goal is to make the supplier feel they are speaking with someone who genuinely knows their culture.

` + prompt;
  }
  if (intelContext) {
    prompt += `\n\n[LIVE INTEL INJECTION]\n${intelContext}`;
  }
  return prompt;
}

export interface NegotiationTurnInput {
  hagglCallId: string;
  supplierText: string;
  /** Prior turns; role 'agent'/'assistant' => assistant, else user. */
  history?: Array<{ role: string; content: unknown }>;
}

export type NegotiationTurnEvent =
  | { type: "delta"; text: string }
  | { type: "done"; hangup: boolean };

/**
 * Run one negotiation turn. Loads RFQ/supplier/call context, runs intel,
 * builds the dialect-aware system prompt, streams Claude Opus, handles the
 * `mark_complete` tool, persists transcript turns + socket events.
 *
 * Yields incremental `delta` text events, then a final `done` event.
 * Throws if call/RFQ/supplier context cannot be loaded.
 */
export async function* runNegotiationTurn(
  input: NegotiationTurnInput
): AsyncGenerator<NegotiationTurnEvent> {
  const { hagglCallId, supplierText } = input;
  const history = input.history || [];

  // 1. Load call context from DB
  const call = hagglCallId ? await getCallById(hagglCallId) : null;
  const rfq = call ? await getRFQById(call.rfq_id) : null;
  const supplier = call ? await getSupplierById(call.supplier_id) : null;

  if (!call || !rfq || !supplier) {
    throw new Error("Negotiation context not found");
  }

  // Persist supplier utterance + push to dashboard
  if (hagglCallId && supplierText) {
    await saveTranscriptTurn(hagglCallId, supplierText, "supplier");
    emitDashboard("transcript_delta", {
      callId: hagglCallId,
      entry: {
        role: "user",
        content: supplierText,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // 2. Detect language from supplier metadata
  const language = supplier?.metadata?.language || "english";
  const dialectContext = getDialectByLocale(getLocaleForLanguage(language));

  // 3. Run OpusInjector intel (Moss + Supermemory) — fire and await
  const intelContext = await buildIntelContext(supplierText, hagglCallId, supplier);

  // 4. Build negotiation prompt with language instructions
  const systemPrompt = buildNegotiationPromptForLanguage(
    rfq,
    supplier,
    dialectContext,
    intelContext
  );

  // 5. Stream Gemini response
  let toolCallName = "";
  let toolCallArgs: any = {};
  let accruedAgentText = "";
  let shouldHangup = false;

  // Gemini conversation history: agent/assistant => "model", else "user".
  const contents = [
    ...history.map((h) => ({
      role: h.role === "agent" || h.role === "assistant" ? "model" : "user",
      parts: [
        { text: typeof h.content === "string" ? h.content : JSON.stringify(h.content) },
      ],
    })),
    { role: "user", parts: [{ text: supplierText }] },
  ];

  const stream = await genAI.models.generateContentStream({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 300,
      temperature: 0.7,
      automaticFunctionCalling: { disable: true },
      tools: [
        {
          functionDeclarations: [
            {
              name: "mark_complete",
              description:
                "Mark the negotiation call as complete and record the final outcome. Call this when the supplier has given a final quote or the negotiation has concluded.",
              parametersJsonSchema: {
                type: "object",
                properties: {
                  quoted_price: {
                    type: "number",
                    description: "The final agreed price from the supplier",
                  },
                  quoted_terms: {
                    type: "string",
                    description: "Payment terms agreed upon (e.g. Net 30, Net 60)",
                  },
                  delivery_timeline: {
                    type: "string",
                    description: "Expected delivery timeline",
                  },
                  confidence_score: {
                    type: "number",
                    description: "Confidence score 0-100 that this supplier will close",
                  },
                },
                required: ["confidence_score"],
              },
            },
          ],
        },
      ],
    },
  });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) {
      accruedAgentText += text;
      yield { type: "delta", text };
    }
    const fcs = chunk.functionCalls;
    if (fcs && fcs.length) {
      for (const fc of fcs) {
        if (fc.name === "mark_complete") {
          toolCallName = "mark_complete";
          toolCallArgs = fc.args || {};
        }
      }
    }
  }

  // Handle mark_complete tool call if fired
  if (toolCallName === "mark_complete") {
    try {
      const result = toolCallArgs;
      shouldHangup = true;

      await tables.calls
        .update({
          status: "completed",
          result,
          ended_at: new Date().toISOString(),
        })
        .eq("id", hagglCallId);

      const queue = getCallQueue();
      const dispatcher = getDispatcher();
      await queue.complete(hagglCallId, result);
      await dispatcher.incrementCompleted(rfq.id);

      emitDashboard("call_status_changed", {
        callId: hagglCallId,
        rfqId: rfq.id,
        status: "completed",
        twilioCallSid: call.twilio_call_sid,
      });
    } catch (toolErr: any) {
      console.error("[Negotiation] Failed to process mark_complete tool:", toolErr.message);
    }
  }

  // Persist agent utterance + push to dashboard
  if (hagglCallId && accruedAgentText) {
    await saveTranscriptTurn(hagglCallId, accruedAgentText, "agent");
    emitDashboard("transcript_delta", {
      callId: hagglCallId,
      entry: {
        role: "assistant",
        content: accruedAgentText,
        timestamp: new Date().toISOString(),
      },
    });
  }

  yield { type: "done", hangup: shouldHangup };
}

/**
 * Terminal call finalization — the old AgentPhone `agent.call_ended` logic.
 * Invoked by the Vapi server webhook on end-of-call.
 */
export async function finalizeCall(hagglCallId: string): Promise<void> {
  if (!hagglCallId) return;
  const { data: call } = await tables.calls
    .select("rfq_id, status")
    .eq("id", hagglCallId)
    .single();
  if (call && call.status !== "completed" && call.status !== "failed") {
    await tables.calls
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
      })
      .eq("id", hagglCallId);

    const queue = getCallQueue();
    const dispatcher = getDispatcher();
    queue.complete(hagglCallId);
    if (call.rfq_id) {
      await dispatcher.incrementCompleted(call.rfq_id);
    }

    emitDashboard("call_status_changed", {
      callId: hagglCallId,
      rfqId: call.rfq_id,
      status: "completed",
    });
  }
}
