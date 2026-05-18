/**
 * Canonical data shapes — copied VERBATIM from
 * `haggl/types/index.ts` (zod schemas dropped; UI doesn't need them).
 *
 * The mock simulator emits these exact shapes, so swapping in the real
 * Vapi/WebSocket backend is a single-file change (see lib/store).
 * Do NOT diverge these from the source of truth.
 */

export type CallStatus =
  | "pending"
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "failed"
  | "busy"
  | "no-answer"
  | "rejected"
  | "timeout"
  | "capped";

export type SupplierStatus = "active" | "inactive" | "blacklisted";

export type NegotiationPhase =
  | "greeting"
  | "disclosure"
  | "requirements"
  | "negotiation"
  | "closing"
  | "completed"
  | "failed";

export interface Supplier {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string | null;
  phone: string;
  email: string | null;
  dialect_prompt: string | null;
  status: SupplierStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RFQItem {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  target_unit_price: number | null;
}

export interface RFQ {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  items: RFQItem[];
  floor_price: number | null;
  target_price: number | null;
  deadline: string | null;
  status: "draft" | "open" | "negotiating" | "closed" | "awarded";
  created_at: string;
  updated_at: string;
}

export interface TranscriptEntry {
  role: "agent" | "supplier" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface NegotiationResult {
  supplier_id: string;
  supplier_name: string;
  quoted_price: number | null;
  quoted_terms: string | null;
  delivery_timeline: string | null;
  confidence_score: number;
  raw_transcript_snippet: string;
  structured_offer: Record<string, unknown> | null;
  ranking_score?: number;
}

export interface NegotiationCall {
  id: string;
  organization_id: string;
  rfq_id: string;
  supplier_id: string;
  twilio_call_sid: string | null;
  stream_sid: string | null;
  status: CallStatus;
  phase: NegotiationPhase;
  duration_seconds: number | null;
  cost: number | null;
  transcript: TranscriptEntry[];
  result: NegotiationResult | null;
  error_message: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RankingScore {
  supplier_id: string;
  supplier_name: string;
  composite_score: number;
  price_score: number;
  terms_score: number;
  reliability_score: number;
  communication_score: number;
  confidence_score: number;
  breakdown: Record<string, number>;
}

export interface AggregatedResults {
  rfq_id: string;
  rfq_title: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  suppliers_contacted: number;
  suppliers_responded: number;
  best_price: number | null;
  best_price_supplier: string | null;
  average_quoted_price: number | null;
  ranked_suppliers: RankingScore[];
  created_at: string;
}

export interface LiveCallEvent {
  type:
    | "call_initiated"
    | "call_ringing"
    | "call_connected"
    | "call_disconnected"
    | "call_failed"
    | "transcript_delta"
    | "agent_speaking"
    | "supplier_speaking"
    | "negotiation_phase_change"
    | "negotiation_result"
    | "call_capped"
    | "opus_analysis";
  call_id: string;
  rfq_id: string;
  supplier_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface OpusAnalysis {
  call_id: string;
  supplier_id: string;
  supplier_name: string;
  negotiation_effectiveness: number;
  price_competitiveness: number;
  communication_quality: number;
  objections_raised: string[];
  strengths: string[];
  weaknesses: string[];
  recommended_next_action: string;
  raw_analysis: string;
  timestamp: string;
}

/* ── UI-only view models (not from backend) ───────────────────── */

export type Language = "Yoruba" | "Twi" | "Hindi" | "English";

export interface ChatMessage {
  id: string;
  role: "agent" | "user" | "system";
  content: string;
  timestamp: string;
  quickReplies?: string[];
}

export interface OnboardingAnswers {
  product: string;
  category: string;
  budgetMin: number;
  budgetMax: number;
  units: number;
  regions: string[];
  languages: Language[];
  priority: "lowest-price" | "fastest-delivery" | "bulk-discount" | "quality-certs";
}

/**
 * The sourcing plan the agent drafts from onboarding answers and the
 * buyer refines on `/plan` before any calls go out. Produced by
 * `/api/plan/generate`, mutated by `/api/plan/refine`, held in the
 * store under `plan`. Shape is the contract between those routes and
 * the `/planning` + `/plan` screens — keep them in sync.
 */
export interface PlanSupplier {
  name: string;
  city: string;
  /** ISO-ish two-letter code shown in the card, e.g. "NG", "GH". */
  countryCode: string;
  country: string;
  language: Language;
}

export interface PlanBudget {
  targetUnit: number;
  capUnit: number;
  units: number;
  estSpend: number;
}

/**
 * One company enriched by Gemini Deep Research (haggl `/api/research`,
 * `suppliers_found` event — `DiscoveredSupplier` on that side). Held
 * alongside the plan as the per-call **context dossier** the voice
 * agent will use; `PlanSupplier` stays the lean shape the rest of the
 * UI renders. Kept loose because `web/` never imports from `haggl/`.
 */
export interface ResearchedSupplier {
  name: string;
  country: string;
  region: string;
  language: string;
  phone?: string;
  specialization?: string;
  notes?: string;
}

export interface SourcingPlan {
  /** Lowercased noun phrase, e.g. "leather sandals". */
  productLabel: string;
  /** One-line agent summary, e.g. "I'll call 6 suppliers across…". */
  summary: string;
  regions: string[];
  suppliers: PlanSupplier[];
  estMinutes: number;
  budget: PlanBudget;
  callStrategy: { mode: string; order: string };
  /** 3–4 negotiation bullets. */
  negotiation: string[];
  /** Human label for the chosen onboarding priority. */
  priorityLabel: string;
}

/**
 * One end-to-end run: a sourcing plan → Gemini Deep Research → a
 * campaign of agent calls. The store keeps a registry of these
 * (`runs`/`runOrder`) and mirrors exactly one (`activeRunId`) into the
 * live top-level fields the dashboard selectors read. A run snapshot is
 * everything needed to re-hydrate that live view later.
 */
export interface ResearchRun {
  id: string;
  title: string;
  createdAt: string;
  /** Seeded, always-available sample run for live demos. Never reset away. */
  isDemo?: boolean;

  plan: SourcingPlan | null;

  /** Deep-research lifecycle for THIS run (mirrors the old single-run fields). */
  research: {
    status: "idle" | "running" | "done" | "error";
    message: string | null;
    companies: ResearchedSupplier[];
  };

  /** Per-run campaign snapshot — the "call investigation" view. */
  rfq: RFQ | null;
  suppliers: Record<string, Supplier>;
  calls: Record<string, NegotiationCall>;
  callOrder: string[];
  callingStarted: boolean;
  campaignStartedAt: string | null;
  elapsedSeconds: number;
  totalCostUsd: number;
  isPausedAll: boolean;
}
