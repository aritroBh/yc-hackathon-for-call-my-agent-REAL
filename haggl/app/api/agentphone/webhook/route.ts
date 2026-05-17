import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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
import { getSupplierMemory } from "@/lib/sponsors/supermemory";
import { getSocketServer } from "@/lib/socket";
import { getCallQueue } from "@/lib/queue";
import { getDispatcher } from "@/lib/dispatcher";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getLocaleForLanguage(lang: string | unknown): string {
  if (typeof lang !== "string") return "en-US";
  const clean = lang.toLowerCase().trim();
  if (clean === "twi" || clean === "akan" || clean === "tw-gh") return "tw-GH";
  if (clean === "yoruba" || clean === "yo-ng") return "yo-NG";
  return "en-US";
}

async function saveTranscriptTurn(
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

async function buildIntelContext(
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

HISTORICAL SUPPLIER INTELLIGENCE (from past negotiations):
${memories || "None available"}

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

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5-20250514", // Opus — the pitch is Opus watching the call in real time
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";
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

    getSocketServer()?.emit("reasoning_trace", {
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
    console.warn("[AgentPhone Webhook] Intel extraction failed:", err.message);
    return "";
  }
}

function buildNegotiationPromptForLanguage(
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
  if (intelContext) {
    prompt += `\n\n[LIVE INTEL INJECTION]\n${intelContext}`;
  }
  return prompt;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();

    if (body.event === "agent.call_ended") {
      const hagglCallId = body.metadata?.haggl_call_id;
      if (hagglCallId) {
        const { data: call } = await tables.calls.select("rfq_id, status").eq("id", hagglCallId).single();
        if (call && call.status !== "completed" && call.status !== "failed") {
          await tables.calls.update({
            status: "completed",
            ended_at: new Date().toISOString(),
          }).eq("id", hagglCallId);
          
          const queue = getCallQueue();
          const dispatcher = getDispatcher();
          queue.complete(hagglCallId);
          if (call.rfq_id) {
            await dispatcher.incrementCompleted(call.rfq_id);
          }
          
          getSocketServer()?.emit("call_status_changed", {
            callId: hagglCallId,
            rfqId: call.rfq_id,
            status: "completed",
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (body.event !== "agent.message" || body.channel !== "voice") {
      return NextResponse.json({ ok: true });
    }

    const hagglCallId = body.metadata?.haggl_call_id;
    const supplierText = body.message;
    const history = body.recentHistory || [];

    // 1. Load call context from DB
    const call = hagglCallId ? await getCallById(hagglCallId) : null;
    const rfq = call ? await getRFQById(call.rfq_id) : null;
    const supplier = call ? await getSupplierById(call.supplier_id) : null;

    if (!call || !rfq || !supplier) {
      return NextResponse.json({ error: "Context not found" }, { status: 404 });
    }

    // Save transcript turn to DB immediately for supplier's utterance
    if (hagglCallId && supplierText) {
      await saveTranscriptTurn(hagglCallId, supplierText, "supplier");
      getSocketServer()?.emit("transcript_delta", {
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

    // 5. Stream Claude response back as NDJSON
    const encoder = new TextEncoder();
    let toolCallName = "";
    let toolCallInput = "";
    let accruedAgentText = "";
    let shouldHangup = false;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await anthropic.messages.create({
            model: "claude-opus-4-5-20250514", // Opus — the pitch is Opus watching the call in real time
            max_tokens: 300,
            stream: true,
            system: systemPrompt,
            tools: [
              {
                name: "mark_complete",
                description:
                  "Mark the negotiation call as complete and record the final outcome. Call this when the supplier has given a final quote or the negotiation has concluded.",
                input_schema: {
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
                    structured_offer: {
                      type: "object",
                      description: "Structured breakdown of the offer",
                    },
                  },
                  required: ["confidence_score"],
                },
              },
            ],
            messages: [
              ...history.map((h: any) => ({
                role: h.role === "agent" ? "assistant" as const : "user" as const,
                content: typeof h.content === "string" ? h.content : JSON.stringify(h.content),
              })),
              { role: "user", content: supplierText },
            ],
          });

          for await (const chunk of response) {
            if (chunk.type === "content_block_delta") {
              if (chunk.delta.type === "text_delta") {
                accruedAgentText += chunk.delta.text;
                const line =
                  JSON.stringify({ text: chunk.delta.text, interim: true }) + "\n";
                controller.enqueue(encoder.encode(line));
              } else if (chunk.delta.type === "input_json_delta") {
                toolCallInput += chunk.delta.partial_json;
              }
            } else if (chunk.type === "content_block_start") {
              if (chunk.content_block.type === "tool_use") {
                toolCallName = chunk.content_block.name;
              }
            }
          }

          // Handle mark_complete tool call if fired
          if (toolCallName === "mark_complete") {
            try {
              const result = JSON.parse(toolCallInput || "{}");
              shouldHangup = true;

              // Save to database call record
              await tables.calls
                .update({
                  status: "completed",
                  result,
                  ended_at: new Date().toISOString(),
                })
                .eq("id", hagglCallId);

              // Update the in-memory call queue and dispatcher
              const queue = getCallQueue();
              const dispatcher = getDispatcher();
              await queue.complete(hagglCallId, result);
              await dispatcher.incrementCompleted(rfq.id);

              getSocketServer()?.emit("call_status_changed", {
                callId: hagglCallId,
                rfqId: rfq.id,
                status: "completed",
                twilioCallSid: call.twilio_call_sid,
              });
            } catch (toolErr: any) {
              console.error("[AgentPhone Webhook] Failed to process mark_complete tool:", toolErr.message);
            }
          }

          // Save transcript turn for agent's utterance
          if (hagglCallId && accruedAgentText) {
            await saveTranscriptTurn(hagglCallId, accruedAgentText, "agent");
            getSocketServer()?.emit("transcript_delta", {
              callId: hagglCallId,
              entry: {
                role: "assistant",
                content: accruedAgentText,
                timestamp: new Date().toISOString(),
              },
            });
          }

          // Enqueue the final SSE end chunk
          const finalLine =
            JSON.stringify({ text: "", interim: false, hangup: shouldHangup }) + "\n";
          controller.enqueue(encoder.encode(finalLine));
        } catch (streamErr: any) {
          console.error("[AgentPhone Webhook] Streaming error:", streamErr.message);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[AgentPhone Webhook] Request error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
