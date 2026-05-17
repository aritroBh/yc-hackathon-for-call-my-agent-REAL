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
  const getMockResearch = (sName: string, pName: string): ResearchResult => {
    const isSteel = pName.toLowerCase().includes("steel");
    if (isSteel) {
      return {
        website: `https://${sName.toLowerCase().replace(/[^a-z0-9]/g, "") || "supplier"}.com`,
        recentNews: [
          `${supplierName} commissions new high-efficiency electric arc furnace in Ohio, increasing production capacity by 25%.`,
          `${supplierName} announces compliance with net-zero carbon initiatives for structural steel products.`
        ],
        estimatedPriceRange: "$800 - $870 per metric ton",
        certifications: ["ISO-9001", "ISO-14001", "AISC Certified Fabricator"],
        redFlags: ["Minor port-clearance delays reported in East Coast shipments during Q4."]
      };
    } else {
      return {
        website: `https://${sName.toLowerCase().replace(/[^a-z0-9]/g, "") || "supplier"}.com`,
        recentNews: [
          `${supplierName} receives aerospace tooling certification.`,
          `${supplierName} highlights high-precision stamping and aluminum molding facilities in new catalog.`
        ],
        estimatedPriceRange: "$8.20 - $9.80 per unit",
        certifications: ["ISO-9001", "AS9100D Aerospace Certified"],
        redFlags: ["No major negative feedback or red flags identified on safety or delivery compliance."]
      };
    }
  };

  if (!API_KEY) {
    console.log(`[browser-use] Research mock fallback loaded for: ${supplierName}`);
    return getMockResearch(supplierName, partName);
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
        if (!output || status === 'error') return getMockResearch(supplierName, partName)
        
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
    console.warn(`[browser-use] run failed or timed out: ${err.message}, returning fallback research.`);
    return getMockResearch(supplierName, partName);
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
  const getMockTradeDocuments = (): TradeDocumentsResult => {
    const randomInvoiceNum = "INV-" + Math.floor(100000 + Math.random() * 900000);
    const mockHsCode = params.hsCode || "6109.10.00";
    const estDuty = `$${(params.totalValue * 0.045).toFixed(2)}`; // 4.5% import duty estimate
    return {
      formsCompleted: [
        "HS Code Lookup (HTS USITC)",
        "Pro Forma Invoice (Trade.gov)",
        "CBP Form 3461 (Entry Summary)"
      ],
      documentsUrl: [
        `https://hts.usitc.gov/?query=${encodeURIComponent(params.partDescription)}`,
        "https://www.trade.gov/pro-forma-invoice",
        "https://www.cbp.gov/document/forms/form-3461-entry-immediate-delivery"
      ],
      hsCode: mockHsCode,
      invoiceNumber: randomInvoiceNum,
      estimatedDuty: estDuty
    };
  };

  if (!API_KEY) {
    console.log(`[browser-use] Trade documents mock fallback loaded for supplier: ${params.supplierName}`);
    return getMockTradeDocuments();
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
        if (!output || status === 'error') return getMockTradeDocuments();

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
          return getMockTradeDocuments();
        }
      }
    }
    throw new Error('Browser Use task timed out after 80s');
  } catch (err: any) {
    console.warn(`[browser-use] fillTradeDocuments failed or timed out: ${err.message}, returning fallback mock.`);
    return getMockTradeDocuments();
  }
}

