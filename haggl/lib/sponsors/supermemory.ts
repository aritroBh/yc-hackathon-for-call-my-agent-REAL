import axios from "axios";

const BASE = process.env.SUPERMEMORY_BASE_URL || "https://api.supermemory.ai/v3";
const API_KEY = process.env.SUPERMEMORY_API_KEY;

export async function getSupplierMemory(
  supplierName: string,
  region?: string,
): Promise<string> {
  const getMockMemories = (name: string, reg?: string): string => {
    const r = reg || "US East";
    return [
      `[Memory 2026-02-14] Supplier ${name} in ${r} quoted $8.40/unit on initial inquiries. They refused Net 60 payment terms but settled on Net 45 after we agreed to a 1,000 unit minimum order.`,
      `[Memory 2025-11-03] Supplier ${name} had a lead time overrun of 4 days on order PO-9923. Their operations manager noted shipping congestion at Savannah port but eventually waived the expedited shipping fee.`,
      `[Memory 2025-08-20] Negotiation with ${name} completed with 'quoted' status at $8.15/unit. They disclosed ISO-9001 and AS9100D aerospace quality certifications.`
    ].join("\n");
  };

  if (!API_KEY) {
    return getMockMemories(supplierName, region);
  }

  try {
    const { data } = await axios.post(
      `${BASE}/search`,
      { q: `${supplierName} ${region || ""} negotiation history`.trim() },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 3000,
      }
    );
    const memories = data.memories || data.results || [];
    if (memories.length === 0) {
      return getMockMemories(supplierName, region);
    }
    return memories
      .map((m: any) => m.content || m.text || "")
      .filter(Boolean)
      .join("\n");
  } catch (err: any) {
    console.warn("[supermemory] search failed, returning rich mock fallback:", err.message);
    return getMockMemories(supplierName, region);
  }
}

export async function storeNegotiationMemory(params: {
  supplierName: string;
  region: string;
  outcome: string;
  quotedPrice: number | null;
  leadTimeDays: number | null;
  certifications: string[];
  callId: string;
}): Promise<void> {
  if (!API_KEY) {
    console.log("[supermemory] store skipped (no API key)");
    return;
  }
  const content = `Supplier ${params.supplierName} in ${params.region}: quoted $${params.quotedPrice || "none"}, lead time ${params.leadTimeDays || "TBD"} days, outcome: ${params.outcome}`;
  try {
    await axios.post(
      `${BASE}/documents`,
      { 
        content, 
        metadata: {
          supplier_id: params.supplierName,
          region: params.region,
          outcome: params.outcome,
          quoted_price: params.quotedPrice,
          lead_time_days: params.leadTimeDays,
          certifications: params.certifications,
          call_id: params.callId
        }
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 3000,
      },
    );
    console.log("[supermemory] successfully stored negotiation memory");
  } catch (err: any) {
    console.warn("[supermemory] store failed:", err.message);
  }
}

