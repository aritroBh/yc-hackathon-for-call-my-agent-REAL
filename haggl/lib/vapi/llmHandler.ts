/**
 * Shared Vapi custom-LLM handler (OpenAI Chat Completions compatible).
 *
 * Vapi appends `/chat/completions` to the configured `model.url`. To keep the
 * haggl call id intact we pass it as a PATH segment (not a query string, which
 * Vapi's append would corrupt): model.url = `${APP}/api/vapi/llm/<hcid>` →
 * Vapi calls `${APP}/api/vapi/llm/<hcid>/chat/completions`.
 *
 * Reuses the negotiation brain in lib/negotiation/core.ts and re-frames its
 * deltas as OpenAI `chat.completion.chunk` SSE.
 */
import { runNegotiationTurn } from "@/lib/negotiation/core";

interface OpenAIMessage {
  role: string;
  content: unknown;
}

function sseChunk(model: string, delta: Record<string, unknown>, finishReason: string | null): string {
  const payload = {
    id: `chatcmpl-${Date.now().toString(36)}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function handleVapiLlm(req: Request, hagglCallIdHint: string): Promise<Response> {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty/invalid body — handled below */
  }

  const model =
    typeof body?.model === "string"
      ? body.model
      : process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

  // Defensive: strip any trailing `/chat/completions` Vapi may have appended
  // (covers the legacy query-string route too).
  const hagglCallId = (
    hagglCallIdHint ||
    new URL(req.url).searchParams.get("hcid") ||
    body?.metadata?.haggl_call_id ||
    ""
  ).replace(/\/chat\/completions$/, "");

  const messages: OpenAIMessage[] = Array.isArray(body?.messages) ? body.messages : [];

  let supplierText = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      supplierText =
        typeof messages[i].content === "string"
          ? (messages[i].content as string)
          : JSON.stringify(messages[i].content);
      break;
    }
  }

  const history = messages
    .filter((m) => m.role === "assistant" || m.role === "user")
    .slice(0, -1)
    .map((m) => ({ role: m.role, content: m.content }));

  const encoder = new TextEncoder();

  console.log(`[vapi-llm] user: "${supplierText}" (hcid=${hagglCallId || "?"}, history=${history.length})`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let agentText = "";
      try {
        controller.enqueue(encoder.encode(sseChunk(model, { role: "assistant" }, null)));

        let produced = false;
        for await (const ev of runNegotiationTurn({ hagglCallId, supplierText, history })) {
          if (ev.type === "delta" && ev.text) {
            produced = true;
            agentText += ev.text;
            controller.enqueue(encoder.encode(sseChunk(model, { content: ev.text }, null)));
          }
        }

        if (!produced) {
          controller.enqueue(encoder.encode(sseChunk(model, { content: "..." }, null)));
        }
        controller.enqueue(encoder.encode(sseChunk(model, {}, "stop")));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        console.log(`[vapi-llm] agent: "${agentText}"`);
      } catch (err: any) {
        console.error("[Vapi custom-llm] turn error:", err?.message);
        if (agentText) console.log(`[vapi-llm] agent(partial): "${agentText}"`);
        controller.enqueue(
          encoder.encode(sseChunk(model, { content: "Mepa wo kyɛw, mente aseɛ. San ka bio." }, null))
        );
        controller.enqueue(encoder.encode(sseChunk(model, {}, "stop")));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
