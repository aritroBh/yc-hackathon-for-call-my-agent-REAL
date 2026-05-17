import type { RFQ, Supplier, NegotiationCall, ChatMessage } from "@/lib/types";

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
