// Demo data ported from the Claude Design handoff (yc-hack/project/shared.jsx).
// Faithful static recreation: 4 Indian raw-cotton suppliers + the brief.

export type Sentiment = "positive" | "neutral" | "negative";
export type CallState = "completed" | "live" | "ringing" | "queued";

export interface Supplier {
  id: string;
  name: string;
  city: string;
  region: string;
  language: string;
  langCode: string;
  contact: string;
  color: string;
  initial: string;
  priceUsd: number;
  moq: number;
  leadDays: number;
  payment: string;
  incoterm: string;
  certs: string[];
  sentiment: Sentiment;
  fitScore: number;
  callDuration: string;
  callState: CallState;
  rank: number;
  summary: string;
  quote?: string;
  quoteEn?: string;
  yardImg?: string | null;
}

export const SUPPLIERS: Supplier[] = [
  {
    id: "surat",
    name: "Surat Textile Co.",
    city: "Surat",
    region: "Gujarat",
    language: "Gujarati",
    langCode: "GU",
    contact: "Rakesh Patel",
    color: "#B45A35",
    initial: "S",
    priceUsd: 1.74,
    moq: 5000,
    leadDays: 12,
    payment: "50% advance / 50% on shipment",
    incoterm: "FOB Mundra",
    certs: ["GOTS", "ISO 9001", "OEKO-TEX"],
    sentiment: "positive",
    fitScore: 94,
    callDuration: "8:42",
    callState: "completed",
    rank: 1,
    summary:
      "Most competitive quote. Offered a 4% additional discount for repeat orders. Already exports to two US buyers, references provided.",
    quote:
      "Hum 1.74 dollar per kilo de sakte hain, agar aap 5,000 kilo se zyada mangao. Quality top grade hai — GOTS certified.",
    quoteEn:
      "We can do $1.74 per kilo for orders above 5,000 kg. Quality is top grade — GOTS certified.",
    yardImg: null,
  },
  {
    id: "coimbatore",
    name: "Coimbatore Cotton Mills",
    city: "Coimbatore",
    region: "Tamil Nadu",
    language: "Tamil",
    langCode: "TA",
    contact: "Selvi Murugan",
    color: "#2F6E6A",
    initial: "C",
    priceUsd: 1.82,
    moq: 10000,
    leadDays: 14,
    payment: "30% advance / 70% on B/L",
    incoterm: "FOB Chennai",
    certs: ["Fair Trade", "ISO 9001"],
    sentiment: "positive",
    fitScore: 87,
    callDuration: "11:08",
    callState: "completed",
    rank: 2,
    summary:
      "Strong on certifications and capacity, but higher MOQ of 10,000 kg. Willing to break the MOQ for a 5¢ premium per kg.",
  },
  {
    id: "indore",
    name: "Indore Agro Exports",
    city: "Indore",
    region: "Madhya Pradesh",
    language: "Hindi",
    langCode: "HI",
    contact: "Arjun Mehta",
    color: "#6E3F66",
    initial: "I",
    priceUsd: 1.91,
    moq: 8000,
    leadDays: 10,
    payment: "50% advance / 50% on shipment",
    incoterm: "FOB Mumbai",
    certs: ["ISO 9001"],
    sentiment: "neutral",
    fitScore: 76,
    callDuration: "6:21",
    callState: "completed",
    rank: 3,
    summary:
      "Fastest lead time (10 days) but only ISO 9001 — missing GOTS / Fair Trade. Held firm at $1.91; would not negotiate further on price.",
  },
  {
    id: "maharashtra",
    name: "Maharashtra Fibre Group",
    city: "Pune",
    region: "Maharashtra",
    language: "Marathi",
    langCode: "MR",
    contact: "Vikram Joshi",
    color: "#9C4825",
    initial: "M",
    priceUsd: 2.05,
    moq: 5000,
    leadDays: 18,
    payment: "100% LC at sight",
    incoterm: "CIF Long Beach",
    certs: ["GOTS", "Fair Trade", "ISO 9001", "BCI"],
    sentiment: "neutral",
    fitScore: 71,
    callDuration: "9:55",
    callState: "completed",
    rank: 4,
    summary:
      "Strongest certification stack (4 incl. BCI) but priciest. Requires 100% LC which ties up capital. Long lead time of 18 days.",
  },
];

export interface Brief {
  product: string;
  region: string;
  qty: number;
  qtyUnit: string;
  targetUsd: number;
  walkawayUsd: number;
  deadline: string;
  notes: string;
}

export const BRIEF: Brief = {
  product: "Raw cotton, Grade A staple length",
  region: "India",
  qty: 10000,
  qtyUnit: "kg",
  targetUsd: 1.8,
  walkawayUsd: 2.2,
  deadline: "Jun 04, 2026",
  notes: "OEKO-TEX or GOTS preferred. Prefer FOB shipping ex-India port.",
};
