import type {
  RFQ,
  Supplier,
  NegotiationCall,
  NegotiationResult,
  ChatMessage,
  ResearchRun,
} from "@/lib/types";

const ORG = "org_atlas_demo";
const RFQ_ID = "rfq_sandals_aba";
const now = () => new Date().toISOString();

/** The active negotiation campaign — 500 leather sandals out of Nigeria. */
export const seedRfq: RFQ = {
  id: RFQ_ID,
  organization_id: ORG,
  title: "Men's leather sandals — 500 units",
  description:
    "500 pairs of men's leather sandals, sizes 40–45, full-grain leather. Hard cap $5.00/pair, delivery within 4 weeks.",
  items: [
    {
      sku: "SND-LE-500",
      description: "Men's full-grain leather sandals, sizes 40–45",
      quantity: 500,
      unit: "pair",
      target_unit_price: 4.25,
    },
  ],
  floor_price: 2500,
  target_price: 2125,
  deadline: null,
  status: "negotiating",
  created_at: now(),
  updated_at: now(),
};

interface SupplierSeed {
  id: string;
  name: string;
  city: string;
  region: "Nigeria" | "Ghana";
  language: "Yoruba" | "Twi";
  phone: string;
}

const SUPPLIER_SEEDS: SupplierSeed[] = [
  { id: "sup_adebayo", name: "Adebayo Leatherworks", city: "Aba", region: "Nigeria", language: "Yoruba", phone: "+234 803 555 0142" },
  { id: "sup_accra", name: "Accra Weavers Union", city: "Accra", region: "Ghana", language: "Twi", phone: "+233 24 555 0188" },
  { id: "sup_kano", name: "Kano Sandal Makers", city: "Kano", region: "Nigeria", language: "Yoruba", phone: "+234 802 555 0207" },
  { id: "sup_lagos", name: "Lagos Footwear Collective", city: "Lagos", region: "Nigeria", language: "Yoruba", phone: "+234 701 555 0319" },
  { id: "sup_ibadan", name: "Ibadan Hide & Sole", city: "Ibadan", region: "Nigeria", language: "Yoruba", phone: "+234 805 555 0461" },
  { id: "sup_kumasi", name: "Kumasi Craft Leather", city: "Kumasi", region: "Ghana", language: "Twi", phone: "+233 27 555 0533" },
];

export const seedSuppliers: Record<string, Supplier> = Object.fromEntries(
  SUPPLIER_SEEDS.map((s) => [
    s.id,
    {
      id: s.id,
      organization_id: ORG,
      name: s.name,
      contact_name: null,
      phone: s.phone,
      email: null,
      dialect_prompt: null,
      status: "active",
      metadata: { region: s.region, city: s.city, language: s.language },
      created_at: now(),
      updated_at: now(),
    } satisfies Supplier,
  ]),
);

function blankCall(supplierId: string): NegotiationCall {
  return {
    id: `call_${supplierId}`,
    organization_id: ORG,
    rfq_id: RFQ_ID,
    supplier_id: supplierId,
    twilio_call_sid: null,
    stream_sid: null,
    status: "pending",
    phase: "greeting",
    duration_seconds: 0,
    cost: 0,
    transcript: [],
    result: null,
    error_message: null,
    started_at: null,
    ended_at: null,
    created_at: now(),
    updated_at: now(),
  };
}

export const seedCalls: Record<string, NegotiationCall> = Object.fromEntries(
  SUPPLIER_SEEDS.map((s) => [`call_${s.id}`, blankCall(s.id)]),
);

export const seedCallOrder: string[] = SUPPLIER_SEEDS.map((s) => `call_${s.id}`);

/** Final negotiated outcome each scripted call drives toward. */
export const SUPPLIER_OUTCOMES: Record<
  string,
  { price: number | null; lead: number | null; outcome: "reached" | "declined" | "capped" }
> = {
  sup_adebayo: { price: 4.05, lead: 16, outcome: "reached" },
  sup_accra: { price: 4.38, lead: 20, outcome: "reached" },
  sup_kano: { price: 4.7, lead: 24, outcome: "reached" },
  sup_kumasi: { price: 4.55, lead: 19, outcome: "reached" },
  sup_lagos: { price: 5.8, lead: 15, outcome: "declined" },
  sup_ibadan: { price: null, lead: null, outcome: "capped" },
};

export const seedChat: ChatMessage[] = [
  {
    id: "m1",
    role: "agent",
    content: "Hey Marcus — what are you looking to source, and what's your rough budget?",
    timestamp: now(),
  },
  {
    id: "m2",
    role: "user",
    content:
      "500 pairs of men's leather sandals, sizes 40–45. Budget $4–5 a pair, hard cap at $5. Need them in 4 weeks.",
    timestamp: now(),
  },
  {
    id: "m3",
    role: "agent",
    content:
      "Got it. Any preferred regions, and is the $5 ceiling firm even if quality is excellent?",
    timestamp: now(),
    quickReplies: ["Nigeria & Ghana", "$5 is a hard cap", "Quality matters most"],
  },
  {
    id: "m4",
    role: "user",
    content: "West Africa — Nigeria or Ghana. $5 is a hard cap, no exceptions.",
    timestamp: now(),
  },
  {
    id: "m5",
    role: "agent",
    content:
      "Perfect. I found 6 matching suppliers across Nigeria and Ghana. I'll call them in Yoruba and Twi, hold your $5 cap, and push for 4-week delivery.",
    timestamp: now(),
  },
];

export const RFQ_ID_EXPORT = RFQ_ID;

/* ── Run registry seeds ────────────────────────────────────────────
 * The store keeps a registry of ResearchRuns. We seed it with:
 *  • the DEMO run — the seed sandals campaign, the reliable live-ledger
 *    showcase for pitches (always present, never reset away);
 *  • two completed HISTORY runs — folded in from the old /history page
 *    so "previous research" has real content on day one. */

export const DEMO_RUN_ID = "run_demo_sandals";

function blankCalls(): Record<string, NegotiationCall> {
  return Object.fromEntries(
    seedCallOrder.map((id) => [id, blankCall(seedCalls[id].supplier_id)]),
  );
}

/** Fresh seed-based campaign (blank/pending calls). Every new run reuses
 *  this so the live-ledger animation works in the mock. */
export function blankSeedCampaign(): Pick<
  ResearchRun,
  "rfq" | "suppliers" | "calls" | "callOrder"
> {
  return {
    rfq: { ...seedRfq },
    suppliers: seedSuppliers,
    calls: blankCalls(),
    callOrder: [...seedCallOrder],
  };
}

function demoRun(): ResearchRun {
  return {
    id: DEMO_RUN_ID,
    title: seedRfq.title,
    createdAt: now(),
    isDemo: true,
    plan: null,
    research: { status: "idle", message: null, companies: [] },
    ...blankSeedCampaign(),
    callingStarted: false,
    campaignStartedAt: null,
    elapsedSeconds: 0,
    totalCostUsd: 0,
    isPausedAll: false,
  };
}

interface HistorySeed {
  id: string;
  title: string;
  daysAgo: number;
  supplier: string;
  city: string;
  country: string;
  language: string;
  price: number;
  unit: string;
  qty: number;
  lead: number;
  specialization: string;
  notes: string;
}

const HISTORY: HistorySeed[] = [
  {
    id: "run_hist_scarves",
    title: "Cotton scarves — 1,000 units",
    daysAgo: 8,
    supplier: "Kente Textiles Co.",
    city: "Kumasi",
    country: "Ghana",
    language: "Twi",
    price: 2.85,
    unit: "unit",
    qty: 1000,
    lead: 18,
    specialization: "Handwoven kente & cotton scarves, AGOA-certified export",
    notes: "10+ yrs export, GSA mark; 30% deposit / net-30 balance.",
  },
  {
    id: "run_hist_turmeric",
    title: "Industrial turmeric — 800 kg",
    daysAgo: 21,
    supplier: "Mehta Spice Traders",
    city: "Erode",
    country: "India",
    language: "Hindi",
    price: 3.1,
    unit: "kg",
    qty: 800,
    lead: 24,
    specialization: "Bulk turmeric & spice export, Spices Board India reg.",
    notes: "Lab COA per lot, FSSAI + ISO 22000, FOB Chennai.",
  },
];

function historyRun(h: HistorySeed): ResearchRun {
  const iso = new Date(Date.now() - h.daysAgo * 864e5).toISOString();
  const supId = `${h.id}_sup`;
  const callId = `${h.id}_call`;
  const result: NegotiationResult = {
    supplier_id: supId,
    supplier_name: h.supplier,
    quoted_price: h.price,
    quoted_terms: `${h.lead}-day delivery`,
    delivery_timeline: `${h.lead} days`,
    confidence_score: 0.9,
    raw_transcript_snippet: `Closed at $${h.price.toFixed(2)}/${h.unit}.`,
    structured_offer: null,
  };
  const supplier: Supplier = {
    id: supId,
    organization_id: ORG,
    name: h.supplier,
    contact_name: null,
    phone: "",
    email: null,
    dialect_prompt: null,
    status: "active",
    metadata: { region: h.country, city: h.city, language: h.language },
    created_at: iso,
    updated_at: iso,
  };
  const call: NegotiationCall = {
    id: callId,
    organization_id: ORG,
    rfq_id: h.id,
    supplier_id: supId,
    twilio_call_sid: null,
    stream_sid: null,
    status: "completed",
    phase: "completed",
    duration_seconds: 360,
    cost: 1.08,
    transcript: [],
    result,
    error_message: null,
    started_at: iso,
    ended_at: iso,
    created_at: iso,
    updated_at: iso,
  };
  return {
    id: h.id,
    title: h.title,
    createdAt: iso,
    plan: null,
    research: {
      status: "idle",
      message: null,
      companies: [
        {
          name: h.supplier,
          country: h.country,
          region: h.city,
          language: h.language,
          specialization: h.specialization,
          notes: h.notes,
        },
      ],
    },
    rfq: {
      id: h.id,
      organization_id: ORG,
      title: h.title,
      description: `${h.qty} ${h.unit} — closed at $${h.price.toFixed(2)}/${h.unit}.`,
      items: [
        {
          sku: h.id,
          description: h.title,
          quantity: h.qty,
          unit: h.unit,
          target_unit_price: h.price,
        },
      ],
      floor_price: null,
      target_price: null,
      deadline: null,
      status: "awarded",
      created_at: iso,
      updated_at: iso,
    },
    suppliers: { [supId]: supplier },
    calls: { [callId]: call },
    callOrder: [callId],
    callingStarted: true,
    campaignStartedAt: iso,
    elapsedSeconds: 420,
    totalCostUsd: 1.08,
    isPausedAll: false,
  };
}

/** Fresh run registry: demo + history. Called for initial state and reset. */
export function buildSeedRuns(): {
  runs: Record<string, ResearchRun>;
  runOrder: string[];
} {
  const all = [demoRun(), ...HISTORY.map(historyRun)];
  return {
    runs: Object.fromEntries(all.map((r) => [r.id, r])),
    runOrder: all.map((r) => r.id),
  };
}
