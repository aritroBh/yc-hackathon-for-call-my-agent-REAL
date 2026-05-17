import axios from "axios";

const BASE = "https://api.supermemory.ai/v3";
const API_KEY = process.env.SUPERMEMORY_API_KEY;

export async function getSupplierMemory(
  supplierName: string,
  region?: string,
): Promise<string> {
  if (!API_KEY) return "";
  try {
    const { data } = await axios.get(`${BASE}/memories`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      params: { query: `${supplierName} ${region || ""} negotiation`.trim() },
      timeout: 3000,
    });
    const memories = data.memories || data.results || [];
    return memories
      .map((m: any) => m.content || m.text || "")
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

export async function storeNegotiationMemory(params: {
  supplierName: string;
  region: string;
  outcome: string;
  quotedPrice: number | null;
  callId: string;
}): Promise<void> {
  if (!API_KEY) return;
  const content = `Supplier: ${params.supplierName} | Region: ${params.region} | Outcome: ${params.outcome} | Price: ${params.quotedPrice ? "$" + params.quotedPrice : "none"} | CallId: ${params.callId}`;
  try {
    await axios.post(
      `${BASE}/memories`,
      { content, metadata: params },
      { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 3000 },
    );
  } catch (err: any) {
    console.warn("[supermemory] store failed:", err.message);
  }
}
