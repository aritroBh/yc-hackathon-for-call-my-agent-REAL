/**
 * Legacy/test Vapi custom-LLM endpoint — reads hcid from the `?hcid=` query.
 * Kept for direct curl testing. The canonical production path is the
 * path-param route at /api/vapi/llm/[hcid]/chat/completions (Vapi appends
 * `/chat/completions`, which corrupts a query string).
 */
import { handleVapiLlm } from "@/lib/vapi/llmHandler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  return handleVapiLlm(req, "");
}
