import { z } from "zod";

export type CallStatus =
  | "pending" | "queued" | "ringing" | "in-progress"
  | "completed" | "failed" | "busy" | "no-answer"
  | "rejected" | "timeout" | "capped";

export type SupplierStatus = "active" | "inactive" | "blacklisted";

export type NegotiationPhase =
  | "greeting" | "disclosure" | "requirements"
  | "negotiation" | "closing" | "completed" | "failed";

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

export interface RFQItem {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  target_unit_price: number | null;
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

export interface DispatchConfig {
  max_concurrent_calls: number;
  max_retries: number;
  retry_delay_seconds: number;
  call_timeout_seconds: number;
}

export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  max_concurrent_calls: 5,
  max_retries: 2,
  retry_delay_seconds: 60,
  call_timeout_seconds: 480,
};

export const RFQCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().min(1),
        target_unit_price: z.number().positive().nullable(),
      }),
    )
    .min(1),
  floor_price: z.number().positive().nullable(),
  target_price: z.number().positive().nullable(),
  deadline: z.string().datetime().nullable(),
});

export const SupplierCreateSchema = z.object({
  name: z.string().min(1).max(200),
  contact_name: z.string().max(200).nullable(),
  phone: z.string().min(5).max(20),
  email: z.string().email().nullable(),
  dialect_prompt: z.string().max(2000).nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const SupplierImportSchema = z.object({
  suppliers: z.array(SupplierCreateSchema).min(1).max(1000),
});

export interface LiveCallEvent {
  type:
    | "call_initiated" | "call_ringing" | "call_connected"
    | "call_disconnected" | "call_failed" | "transcript_delta"
    | "agent_speaking" | "supplier_speaking"
    | "negotiation_phase_change" | "negotiation_result"
    | "call_capped" | "opus_analysis";
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

export interface RLFeedback {
  id: string;
  call_id: string;
  rfq_id: string;
  supplier_id: string;
  rating: number;
  feedback_category: string;
  feedback_text: string;
  created_at: string;
}
