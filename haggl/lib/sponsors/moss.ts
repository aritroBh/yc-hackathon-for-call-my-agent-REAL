import axios from "axios";

const MOSS_BASE = "https://api.usemoss.dev";
const API_KEY = process.env.MOSS_API_KEY;

export interface MossResult {
  text: string;
  score: number;
  source?: string;
}

export async function mossSearch(query: string, topK = 3): Promise<MossResult[]> {
  if (!API_KEY) return [];
  try {
    const { data } = await axios.post(
      `${MOSS_BASE}/search`,
      { query, top_k: topK },
      { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 3000 },
    );
    return data.results || [];
  } catch {
    return [];
  }
}

export async function getMossMarketContext(trigger: string): Promise<string> {
  const results = await mossSearch(trigger, 3);
  if (!results.length) return "";
  return results.map((r) => r.text).join("\n");
}
