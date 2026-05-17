// ProcureAI domain types. Demo data intentionally removed — screens render
// empty / skeleton states until wired to real data.

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

// No data yet — populate from the real API when ready.
export const SUPPLIERS: Supplier[] = [];
export const BRIEF: Brief | null = null;
