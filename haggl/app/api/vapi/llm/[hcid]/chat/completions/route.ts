/**
 * Canonical Vapi custom-LLM endpoint.
 *
 * model.url is set to `${APP}/api/vapi/llm/<hcid>` (see lib/vapi.ts); Vapi
 * appends `/chat/completions`, landing here with the call id safe in the path.
 */
import { handleVapiLlm } from "@/lib/vapi/llmHandler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { hcid: string } }
): Promise<Response> {
  return handleVapiLlm(req, decodeURIComponent(params.hcid || ""));
}
