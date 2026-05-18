import type { RFQ, Supplier, NegotiationCall, ChatMessage } from "@/lib/types";

const ORG = "org_atlas_demo";
const RFQ_ID = "rfq_sandals_global";
const now = () => new Date().toISOString();

/** Active campaign — 500 leather sandals across West Africa + South Asia. */
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
  region: "Nigeria" | "India" | "Bangladesh";
  language: "Yoruba" | "Hindi" | "Bengali";
  phone: string;
}

const SUPPLIER_SEEDS: SupplierSeed[] = [
  // 2 Bengali — India/Bangladesh (Bengali first for live call test)
  { id: "sup_kolkata", name: "Kolkata Fine Leathers",    city: "Kolkata", region: "India",      language: "Bengali", phone: "+19259676242"      },
  { id: "sup_dhaka",   name: "Dhaka Sandal Co.",         city: "Dhaka",   region: "Bangladesh", language: "Bengali", phone: "+880 171 555 0100"  },
  // 2 Nigerian — Yoruba
  { id: "sup_adebayo", name: "Adebayo Leatherworks",    city: "Aba",     region: "Nigeria",    language: "Yoruba",  phone: "+234 803 555 0142" },
  { id: "sup_kano",    name: "Kano Sandal Makers",       city: "Kano",    region: "Nigeria",    language: "Yoruba",  phone: "+234 802 555 0207" },
  // 2 Indian — Hindi
  { id: "sup_delhi",   name: "Delhi Leather Craft",      city: "Delhi",   region: "India",      language: "Hindi",   phone: "+91 98100 11222"   },
  { id: "sup_mumbai",  name: "Mumbai Footwear House",    city: "Mumbai",  region: "India",      language: "Hindi",   phone: "+91 98200 33444"   },
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
  sup_adebayo: { price: 4.05, lead: 16, outcome: "reached"  },
  sup_kano:    { price: 5.80, lead: 15, outcome: "declined" },
  sup_delhi:   { price: 3.90, lead: 18, outcome: "reached"  },
  sup_mumbai:  { price: 4.20, lead: 21, outcome: "reached"  },
  sup_kolkata: { price: 3.75, lead: 20, outcome: "reached"  },
  sup_dhaka:   { price: null, lead: null, outcome: "capped" },
};

export const seedChat: ChatMessage[] = [
  {
    id: "m1",
    role: "agent",
    content: "Hey — what are you looking to source, and what's your rough budget?",
    timestamp: now(),
  },
  {
    id: "m2",
    role: "user",
    content: "500 pairs of men's leather sandals, sizes 40–45. Budget $4–5 a pair, hard cap at $5. Need them in 4 weeks.",
    timestamp: now(),
  },
  {
    id: "m3",
    role: "agent",
    content: "Got it. Any preferred regions, and is the $5 ceiling firm even if quality is excellent?",
    timestamp: now(),
    quickReplies: ["West Africa + South Asia", "$5 is a hard cap", "Quality matters most"],
  },
  {
    id: "m4",
    role: "user",
    content: "Nigeria, India, Bangladesh — wherever the best price is. $5 is a hard cap, no exceptions.",
    timestamp: now(),
  },
  {
    id: "m5",
    role: "agent",
    content:
      "Found 6 suppliers across Nigeria, India, and Bangladesh. I'll call them in Yoruba, Hindi, and Bengali — hold your $5 cap and push for 4-week delivery.",
    timestamp: now(),
  },
];

export const RFQ_ID_EXPORT = RFQ_ID;
