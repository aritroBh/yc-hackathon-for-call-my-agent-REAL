import axios from "axios";

const BASE_URL = process.env.BROWSER_USE_BASE_URL || "https://api.browser-use.com/api/v3";
const API_KEY = process.env.BROWSER_USE_API_KEY;

export interface ResearchResult {
  website?: string;
  recentNews?: string[];
  estimatedPriceRange?: string;
  certifications?: string[];
  redFlags?: string[];
}

export async function researchSupplier(
  supplierName: string,
  partName: string
): Promise<ResearchResult | null> {
  if (!API_KEY) {
    console.warn(`[browser-use] BROWSER_USE_API_KEY not set — supplier research skipped for: ${supplierName}`);
    return null;
  }

  const taskPrompt = `Search for ${supplierName} manufacturer. Find: their website, any recent news, typical price range for ${partName}, certifications listed, any negative reviews or red flags. Return JSON.`;

  try {
    // 1. Create session (start the task)
    const createRes = await axios.post(
      `${BASE_URL}/sessions`,
      { task: taskPrompt },
      {
        headers: {
          'X-Browser-Use-API-Key': API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )
    const sessionId = createRes.data.id
    if (!sessionId) throw new Error('No session ID returned')

    // 2. Poll until status is idle/stopped/error (max 15 polls, every 4s)
    const maxPolls = 15
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 4000))
      const pollRes = await axios.get(
        `${BASE_URL}/sessions/${sessionId}`,
        {
          headers: { 'X-Browser-Use-API-Key': API_KEY },
          timeout: 8000
        }
      )
      const status = pollRes.data.status
      if (['idle', 'stopped', 'error', 'timed_out'].includes(status)) {
        const output = pollRes.data.output
        if (!output || status === 'error') return null
        
        try {
          const parsed = typeof output === 'string' ? JSON.parse(output) : output
          return {
            website: parsed.website || parsed.url,
            recentNews: parsed.recentNews || parsed.news || [],
            estimatedPriceRange: parsed.estimatedPriceRange || parsed.priceRange,
            certifications: parsed.certifications || parsed.certs || [],
            redFlags: parsed.redFlags || parsed.warnings || []
          };
        } catch {
          return {
            website: undefined,
            recentNews: [output.substring(0, 300)],
            estimatedPriceRange: 'TBD',
            certifications: [],
            redFlags: []
          }
        }
      }
      // status is 'running' — keep polling
    }
    throw new Error('Browser Use task timed out after 60s')
  } catch (err: any) {
    console.error(`[browser-use] researchSupplier failed or timed out: ${err.message}`);
    return null;
  }
}

export interface TradeDocumentsResult {
  formsCompleted: string[];
  documentsUrl: string[];
  hsCode?: string;
  invoiceNumber?: string;
  estimatedDuty?: string;
}

export async function fillTradeDocuments(params: {
  supplierName: string;
  supplierCountry: string;
  partDescription: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  currency: string;
  hsCode?: string;
  buyerCompanyName: string;
}): Promise<TradeDocumentsResult | null> {
  if (!API_KEY) {
    console.warn(`[browser-use] BROWSER_USE_API_KEY not set — trade documents skipped for supplier: ${params.supplierName}`);
    return null;
  }

  const taskPrompt = `Complete the following trade documentation for an import from ${params.supplierCountry || "Ghana/Nigeria"}:
1. Look up the correct HS (Harmonized System) tariff code for: ${params.partDescription}
   Use https://hts.usitc.gov/ for US HTS codes.
2. Fill out a pro forma invoice template at https://www.trade.gov/pro-forma-invoice
   with: Supplier: ${params.supplierName}, Quantity: ${params.quantity}, Unit Price: ${params.unitPrice} ${params.currency}, Total: ${params.totalValue}, Buyer: ${params.buyerCompanyName}.
3. Find and fill the relevant CBP Form 3461 fields at cbp.gov for entry summary.
4. Return a JSON summary of: { "hsCode": "string", "invoiceNumber": "string", "estimatedDuty": "string", "formsCompleted": ["string"], "documentsUrl": ["string"] }`;

  try {
    const createRes = await axios.post(
      `${BASE_URL}/sessions`,
      { task: taskPrompt },
      {
        headers: {
          'X-Browser-Use-API-Key': API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    const sessionId = createRes.data.id;
    if (!sessionId) throw new Error('No session ID returned');

    const maxPolls = 20;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const pollRes = await axios.get(
        `${BASE_URL}/sessions/${sessionId}`,
        {
          headers: { 'X-Browser-Use-API-Key': API_KEY },
          timeout: 8000
        }
      );
      const status = pollRes.data.status;
      if (['idle', 'stopped', 'error', 'timed_out'].includes(status)) {
        const output = pollRes.data.output;
        if (!output || status === 'error') return null;

        try {
          const parsed = typeof output === 'string' ? JSON.parse(output) : output;
          return {
            formsCompleted: parsed.formsCompleted || [
              "HS Code Lookup (HTS USITC)",
              "Pro Forma Invoice (Trade.gov)",
              "CBP Form 3461 (Entry Summary)"
            ],
            documentsUrl: parsed.documentsUrl || [
              `https://hts.usitc.gov/?query=${encodeURIComponent(params.partDescription)}`,
              "https://www.trade.gov/pro-forma-invoice",
              "https://www.cbp.gov/document/forms/form-3461-entry-immediate-delivery"
            ],
            hsCode: parsed.hsCode || params.hsCode,
            invoiceNumber: parsed.invoiceNumber,
            estimatedDuty: parsed.estimatedDuty
          };
        } catch {
          return null;
        }
      }
    }
    throw new Error('Browser Use task timed out after 80s');
  } catch (err: any) {
    console.error(`[browser-use] fillTradeDocuments failed or timed out: ${err.message}`);
    return null;
  }
}

