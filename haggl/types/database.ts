// ──────────────────────────────────────────────────────
// HAGGL Database Type Definitions
// Generated from db/schema.sql
// ──────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────

export type UserRole = "admin" | "procurement_manager" | "viewer";
export type SupplierStatus = "active" | "inactive" | "blacklisted";
export type RFQStatus =
  | "draft"
  | "open"
  | "negotiating"
  | "closed"
  | "awarded"
  | "cancelled";
export type CallStatus =
  | "pending"
  | "queued"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed"
  | "busy"
  | "no_answer"
  | "rejected"
  | "timeout"
  | "capped";
export type CallPhase =
  | "greeting"
  | "disclosure"
  | "requirements"
  | "negotiation"
  | "closing"
  | "completed"
  | "failed";
export type FeedbackCategory =
  | "pricing"
  | "communication"
  | "speed"
  | "accuracy"
  | "compliance"
  | "general";
export type TraceType =
  | "deepgram_event"
  | "llm_prompt"
  | "llm_response"
  | "function_call"
  | "negotiation_logic"
  | "error";
export type TraceProvider = "deepgram" | "gemini" | "claude" | "system";

// ── Row types ────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierRow {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string | null;
  phone: string;
  email: string | null;
  status: SupplierStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DialectConfigRow {
  id: string;
  name: string;
  locale: string;
  prompt_template: string;
  speaking_style: string;
  cultural_notes: string | null;
  formality_level: "formal" | "semi_formal" | "casual";
  greeting_phrase: string | null;
  closing_phrase: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RFQRow {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  items: RFQItem[];
  floor_price: string | null; // AES-256-GCM encrypted
  target_price: number | null;
  currency: string;
  deadline: string | null;
  status: RFQStatus;
  created_by: string | null;
  assigned_to: string | null;
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

export interface RFQSupplierRow {
  id: string;
  rfq_id: string;
  supplier_id: string;
  dialect_id: string | null;
  status: "pending" | "contacted" | "negotiating" | "agreed" | "declined" | "no_answer";
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallRow {
  id: string;
  rfq_id: string;
  supplier_id: string;
  rfq_supplier_id: string | null;
  twilio_call_sid: string | null;
  stream_sid: string | null;
  status: CallStatus;
  phase: CallPhase;
  duration_seconds: number | null;
  cost_millicents: number | null;
  transcript: TranscriptEntry[];
  result: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  ended_at: string | null;
  initiated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptEntry {
  role: "agent" | "supplier" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ReasoningTraceRow {
  id: string;
  call_id: string;
  trace_type: TraceType;
  provider: TraceProvider;
  phase: CallPhase | null;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  tokens_used: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface FeedbackRow {
  id: string;
  call_id: string;
  rfq_id: string;
  supplier_id: string;
  user_id: string | null;
  category: FeedbackCategory;
  rating: number;
  comment: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Insert types ─────────────────────────────────────

export type UserInsert = Omit<UserRow, "id" | "created_at" | "updated_at">;
export type SupplierInsert = Omit<SupplierRow, "id" | "created_at" | "updated_at">;
export type DialectConfigInsert = Omit<DialectConfigRow, "id" | "created_at" | "updated_at">;
export type RFQInsert = Omit<RFQRow, "id" | "created_at" | "updated_at">;
export type RFQSupplierInsert = Omit<RFQSupplierRow, "id" | "created_at" | "updated_at">;
export type CallInsert = Omit<CallRow, "id" | "created_at" | "updated_at">;
export type ReasoningTraceInsert = Omit<ReasoningTraceRow, "id" | "created_at">;
export type FeedbackInsert = Omit<FeedbackRow, "id" | "created_at">;

// ── Query helpers ────────────────────────────────────

export interface CallWithRelations extends CallRow {
  rfq: Pick<RFQRow, "title" | "status"> | null;
  supplier: Pick<SupplierRow, "name" | "phone" | "contact_name"> | null;
}

export interface RFQWithRelations extends RFQRow {
  created_by_user: Pick<UserRow, "name" | "email"> | null;
  assigned_to_user: Pick<UserRow, "name" | "email"> | null;
  suppliers: (RFQSupplierRow & { supplier: Pick<SupplierRow, "name" | "phone"> | null })[];
}
