export type TriggerCategory =
  | "steel_price"
  | "regulation"
  | "moq"
  | "certification"
  | "shipping"
  | "geopolitical"
  | "raw_material"
  | "labor_cost"
  | "tariff"
  | "quality"
  | "inventory"
  | "energy_cost"
  | "general";

export interface DetectedTrigger {
  category: TriggerCategory;
  claim: string;
  rawText: string;
  confidence: number;
  patterns: string[];
  timestamp: number;
}

interface TriggerPattern {
  category: TriggerCategory;
  patterns: RegExp[];
  weight: number;
  minWordCount: number;
}

const TRIGGER_PATTERNS: TriggerPattern[] = [
  {
    category: "steel_price",
    weight: 0.85,
    minWordCount: 3,
    patterns: [
      /\bsteel\s+price(?:s)?\b/i,
      /\bsteel\s+cost(?:s)?\b/i,
      /\b(?:iron|steel)\s+ore\s+price/i,
      /\bsteel\s+(?:market|industry|sector)\b/i,
      /\b(?:scrap|rebar|coil)\s+(?:price|cost|rate)/i,
      /\b(?:price|cost)\s+of\s+steel\b/i,
      /\bsteel\s+(?:mill|producer|manufacturer)\s+(?:price|cost)/i,
      /\bsteel\s+(?:went|is|has|been)\s+up\b/i,
      /\bincrease\s+(?:in\s+)?steel\b/i,
    ],
  },
  {
    category: "regulation",
    weight: 0.8,
    minWordCount: 4,
    patterns: [
      /\b(?:new|recent|updated)\s+regulations?\b/i,
      /\bregulatory\s+(?:change|requirement|compliance)\b/i,
      /\bgovernment\s+(?:regulation|mandate|policy|rule)\b/i,
      /\b(?:BIS|ISO|FSSAI|FDA|CE|RoHS|REACH)\s+(?:certification|requirement|compliance|standard)/i,
      /\b(?:environmental|safety|quality)\s+(?:regulation|standard|norm|law)\b/i,
      /\bcompliance\s+(?:cost|requirement|issue|burden)\b/i,
      /\blegal\s+(?:requirement|obligation|mandate)\b/i,
      /\b(?:industry|trade)\s+(?:standard|regulation|compliance)\b/i,
    ],
  },
  {
    category: "moq",
    weight: 0.9,
    minWordCount: 2,
    patterns: [
      /\bMOQ\b/i,
      /\bminimum\s+order\s+quantit/i,
      /\bminimum\s+(?:quantity|order|batch)\b/i,
      /\b(?:can'?t|cannot|unable)\s+(?:go\s+)?below\b.*\b(?:quantity|order|qty)\b/i,
      /\bminimum\s+of\s+\d+/i,
      /\bsmallest\s+(?:order|batch|lot|quantity|run)\b/i,
    ],
  },
  {
    category: "certification",
    weight: 0.85,
    minWordCount: 3,
    patterns: [
      /\b(?:ISO|BIS|CE|RoHS|REACH|UL|FDA)\s+(?:certif|certified|certification|approv|required|compliant)/i,
      /\bcertification\s+(?:cost|process|time|fee|required)\b/i,
      /\b(?:new\s+)?certification\s+(?:standard|requirement)\b/i,
      /\b(?:needs?|requires?|demands?)\s+(?:certification|certified|approval)\b/i,
      /\bcertification\s+(?:will|would|may|could)\s+(?:cost|take|require)\b/i,
      /\blicense\s+(?:fee|cost|renewal|required)\b/i,
    ],
  },
  {
    category: "shipping",
    weight: 0.8,
    minWordCount: 3,
    patterns: [
      /\bshipping\s+(?:delay|cost|rate|fee|price|problem|issue)\b/i,
      /\bfreight\s+(?:cost|rate|price|surcharge|delay|increase)\b/i,
      /\b(?:ocean|sea|air|ground|rail)\s+freight\b/i,
      /\bshipment\s+(?:delay|late|problem|issue|hold)\b/i,
      /\blogistics\s+(?:cost|issue|problem|constraint|challenge)\b/i,
      /\bcontainer\s+(?:price|cost|rate|shortage|delay)\b/i,
      /\bsupply\s+chain\s+(?:issue|problem|disruption|delay)\b/i,
      /\bport\s+(?:congestion|delay|strike|backlog)\b/i,
      /\b(?:delivery|lead)\s+time\s+(?:increase|extend|longer|delay)\b/i,
    ],
  },
  {
    category: "geopolitical",
    weight: 0.9,
    minWordCount: 4,
    patterns: [
      /\b(?:China|US|India|Russia|EU|Europe)\s+(?:tariff|trade\s+war|sanction|restriction|export\s+control)\b/i,
      /\btrade\s+(?:war|tension|dispute|restriction|barrier)\b/i,
      /\b(?:tariff|duty|import\s+tax)\s+(?:increase|change|imposed|new)\b/i,
      /\bexport\s+(?:control|restriction|ban|license)\b/i,
      /\bgeopolitical\s+(?:risk|tension|uncertainty|situation)\b/i,
      /\b(?:sanction|embargo)\s+(?:against|on|impact)\b/i,
      /\bpolitical\s+(?:instability|uncertainty|crisis)\b/i,
      /\b(?:war|conflict|dispute)\s+(?:impact|affect|effect)\s+(?:supply|price|trade)\b/i,
    ],
  },
  {
    category: "raw_material",
    weight: 0.85,
    minWordCount: 3,
    patterns: [
      /\braw\s+material\s+(?:price|cost|increase|shortage|up)\b/i,
      /\b(?:copper|aluminum|plastic|rubber|timber|chemical|polymer)\s+(?:price|cost|shortage|increase)\b/i,
      /\b(?:commodity|input)\s+(?:price|cost|increase|volatility)\b/i,
      /\bmaterial\s+(?:price|cost|shortage|increase|surcharge)\b/i,
      /\bresin\s+(?:price|cost|surcharge)\b/i,
      /\b(?:primary|base)\s+material\s+(?:cost|price)\b/i,
    ],
  },
  {
    category: "labor_cost",
    weight: 0.75,
    minWordCount: 4,
    patterns: [
      /\blabor\s+(?:cost|shortage|rate|price|increase)\b/i,
      /\b(?:wage|salary)\s+(?:increase|hike|rise|adjustment)\b/i,
      /\b(?:minimum|living)\s+wage\s+(?:increase|change|new)\b/i,
      /\bworker\s+(?:shortage|scarcity|unavailable)\b/i,
      /\b(?:staff|workforce|employee)\s+(?:shortage|crisis|shortfall)\b/i,
      /\bskilled\s+(?:labor|worker|workforce)\s+(?:shortage|scarce)\b/i,
    ],
  },
  {
    category: "tariff",
    weight: 0.9,
    minWordCount: 3,
    patterns: [
      /\btariff\s+(?:rate|increase|change|imposed|new|reduction|exemption)\b/i,
      /\b(?:import|export)\s+dut/i,
      /\bcustoms\s+(?:dut|fee|charge|tariff)\b/i,
      /\banti-dumping\s+(?:dut|measure|investigation)\b/i,
      /\bcountervailing\s+dut/i,
      /\bsection\s+301\b/i,
      /\b(?:Section|Chapter)\s+[0-9]{2}\s+tariff\b/i,
    ],
  },
  {
    category: "quality",
    weight: 0.8,
    minWordCount: 4,
    patterns: [
      /\bquality\s+(?:issue|problem|concern|standard|requirement|control)\b/i,
      /\b(?:rejection|defect|return)\s+(?:rate|percentage|ratio|issue)\b/i,
      /\b(?:QC|QA)\s+(?:issue|problem|standard|requirement|process)\b/i,
      /\bquality\s+(?:adjustment|uplift|premium)\b/i,
      /\b(?:grade|class|tier)\s+(?:A|B|1|2|premium|standard)\b/i,
      /\bspecification\s+(?:change|deviation|update|requirement)\b/i,
      /\bmaterial\s+spec(?:ification)?\s+(?:change|update)\b/i,
    ],
  },
  {
    category: "inventory",
    weight: 0.75,
    minWordCount: 3,
    patterns: [
      /\binventor\s+(?:shortage|lack|insufficient|low|out)\b/i,
      /\b(?:stock|inventory)\s+(?:level|status|available|position)\b/i,
      /\b(?:out\s+of\s+stock|backorder|back\s+order)\b/i,
      /\b(?:low|limited|constrained)\s+(?:stock|inventory|supply)\b/i,
      /\b(?:surplus|excess|overstock)\s+(?:inventory|stock)\b/i,
    ],
  },
  {
    category: "energy_cost",
    weight: 0.75,
    minWordCount: 3,
    patterns: [
      /\benergy\s+(?:cost|price|surcharge|increase)\b/i,
      /\b(?:electricity|power|gas|fuel)\s+(?:cost|price|rate|increase)\b/i,
      /\butilit\s+(?:cost|rate|price|surcharge|increase)\b/i,
      /\bpower\s+(?:cost|shortage|crisis|outage)\b/i,
    ],
  },
];

export function detectTriggers(
  text: string,
  existingClaims: string[],
): DetectedTrigger[] {
  if (!text || text.length < 10) return [];

  const triggers: DetectedTrigger[] = [];
  const lower = text.toLowerCase();
  const now = Date.now();

  for (const rule of TRIGGER_PATTERNS) {
    const wordCount = lower.split(/\s+/).length;
    if (wordCount < rule.minWordCount) continue;

    const matchedPatterns: string[] = [];

    for (const regex of rule.patterns) {
      const match = lower.match(regex);
      if (match) {
        matchedPatterns.push(match[0]);

        const claim = extractClaim(text, match.index!, match[0].length);
        if (isDuplicate(claim, existingClaims)) continue;

        triggers.push({
          category: rule.category,
          claim,
          rawText: text,
          confidence: rule.weight + (match[0].length > 15 ? 0.1 : 0),
          patterns: [match[0], ...matchedPatterns],
          timestamp: now,
        });
        break;
      }
    }
  }

  return triggers.sort((a, b) => b.confidence - a.confidence);
}

function extractClaim(
  text: string,
  matchIndex: number,
  matchLength: number,
): string {
  const sentenceStart = text.lastIndexOf(".", matchIndex) + 1;
  const sentenceEnd = text.indexOf(".", matchIndex + matchLength);
  const start = sentenceStart > 0 ? sentenceStart + 1 : 0;
  const end = sentenceEnd > 0 ? sentenceEnd : text.length;
  return text.slice(start, end).trim().replace(/\s+/g, " ");
}

function isDuplicate(claim: string, existingClaims: string[]): boolean {
  const lower = claim.toLowerCase().slice(0, 60);
  return existingClaims.some((c) => {
    const existing = c.toLowerCase().slice(0, 60);
    return existing.includes(lower) || lower.includes(existing);
  });
}

export function getTriggerSummary(category: TriggerCategory): string {
  const summaries: Record<TriggerCategory, string> = {
    steel_price: "supplier claiming steel/iron price increases affecting their costs",
    regulation: "supplier citing regulatory or compliance requirements as cost factor",
    moq: "supplier stating minimum order quantity constraints",
    certification: "supplier mentioning certification costs or requirements",
    shipping: "supplier citing shipping, freight, or logistics cost increases or delays",
    geopolitical: "supplier referencing geopolitical events affecting trade or pricing",
    raw_material: "supplier claiming raw material price increases or shortages",
    labor_cost: "supplier citing labor cost increases or labor shortages",
    tariff: "supplier referencing tariff or import duty impositions",
    quality: "supplier making quality-related claims or specification changes",
    inventory: "supplier discussing inventory constraints or availability issues",
    energy_cost: "supplier citing energy or utility cost increases",
    general: "supplier made a factual claim that warrants verification",
  };
  return summaries[category] || summaries.general;
}
