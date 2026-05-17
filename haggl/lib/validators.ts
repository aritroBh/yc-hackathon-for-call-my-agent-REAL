import { z } from "zod";

// ── Organization ────────────────────────────────────

export const OrganizationCreateSchema = z.object({
  name: z.string().min(1).max(200),
  api_key: z.string().min(8).max(64).optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
});

// ── User ────────────────────────────────────────────

export const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum(["admin", "procurement_manager", "viewer"]).default("procurement_manager"),
  avatar_url: z.string().url().nullable().optional(),
  is_active: z.boolean().default(true),
  organization_id: z.string().uuid(),
});

export const UserUpdateSchema = UserCreateSchema.partial().omit({ organization_id: true });

// ── Supplier ────────────────────────────────────────

export const SupplierCreateSchema = z.object({
  organization_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  contact_name: z.string().max(200).nullable().optional(),
  phone: z
    .string()
    .min(5)
    .max(20)
    .regex(/^\+?[0-9\s\-().]+$/, "Invalid phone number format"),
  email: z.string().email().nullable().optional(),
  status: z.enum(["active", "inactive", "blacklisted"]).default("active"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const SupplierUpdateSchema = SupplierCreateSchema.partial().omit({ organization_id: true });

export const SupplierImportSchema = z.object({
  organization_id: z.string().uuid(),
  suppliers: z.array(SupplierCreateSchema.omit({ organization_id: true })).min(1).max(1000),
});

// ── Dialect Config ──────────────────────────────────

export const DialectConfigCreateSchema = z.object({
  name: z.string().min(1).max(100),
  locale: z.string().min(2).max(10),
  prompt_template: z.string().min(10).max(10000),
  speaking_style: z.string().min(10).max(2000),
  cultural_notes: z.string().max(2000).nullable().optional(),
  formality_level: z.enum(["formal", "semi_formal", "casual"]).default("formal"),
  greeting_phrase: z.string().max(500).nullable().optional(),
  closing_phrase: z.string().max(500).nullable().optional(),
  is_active: z.boolean().default(true),
});

// ── RFQ ─────────────────────────────────────────────

const RFQItemSchema = z.object({
  sku: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  quantity: z.number().positive().finite(),
  unit: z.string().min(1).max(50),
  target_unit_price: z.number().positive().finite().nullable().optional(),
});

export const RFQCreateSchema = z.object({
  organization_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  items: z.array(RFQItemSchema).min(1).max(100),
  floor_price: z.number().positive().finite().nullable().optional(),
  target_price: z.number().positive().finite().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  deadline: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "open", "negotiating", "closed", "awarded", "cancelled"]).default("draft"),
  created_by: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export const RFQUpdateSchema = RFQCreateSchema.partial().omit({ organization_id: true, created_by: true });

// ── RFQ Supplier ────────────────────────────────────

export const RFQSupplierLinkSchema = z.object({
  rfq_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  dialect_id: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(0).max(100).default(0),
  notes: z.string().max(1000).nullable().optional(),
});

export const RFQBulkDispatchSchema = z.object({
  rfq_id: z.string().uuid(),
  supplier_ids: z.array(z.string().uuid()).min(1).max(50),
  dialect_overrides: z.record(z.string().uuid(), z.string().uuid()).optional(),
});

// ── Call ─────────────────────────────────────────────

const TranscriptEntrySchema = z.object({
  role: z.enum(["agent", "supplier", "system"]),
  content: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CallCreateSchema = z.object({
  rfq_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  rfq_supplier_id: z.string().uuid().nullable().optional(),
  initiated_by: z.string().uuid().nullable().optional(),
});

export const CallUpdateSchema = z.object({
  status: z
    .enum([
      "pending",
      "queued",
      "ringing",
      "in_progress",
      "completed",
      "failed",
      "busy",
      "no_answer",
      "rejected",
      "timeout",
      "capped",
    ])
    .optional(),
  phase: z
    .enum([
      "greeting",
      "disclosure",
      "requirements",
      "negotiation",
      "closing",
      "completed",
      "failed",
    ])
    .optional(),
  duration_seconds: z.number().int().nonnegative().nullable().optional(),
  cost_millicents: z.number().int().nonnegative().nullable().optional(),
  transcript: z.array(TranscriptEntrySchema).optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  error_message: z.string().max(2000).nullable().optional(),
  ended_at: z.string().datetime().nullable().optional(),
});

// ── Reasoning Trace ─────────────────────────────────

export const ReasoningTraceCreateSchema = z.object({
  call_id: z.string().uuid(),
  trace_type: z.enum([
    "deepgram_event",
    "llm_prompt",
    "llm_response",
    "function_call",
    "negotiation_logic",
    "error",
  ]),
  provider: z.enum(["deepgram", "gemini", "claude", "system"]),
  phase: z
    .enum([
      "greeting",
      "disclosure",
      "requirements",
      "negotiation",
      "closing",
      "completed",
      "failed",
    ])
    .nullable()
    .optional(),
  input_data: z.record(z.string(), z.unknown()).nullable().optional(),
  output_data: z.record(z.string(), z.unknown()).nullable().optional(),
  tokens_used: z.number().int().nonnegative().nullable().optional(),
  latency_ms: z.number().int().nonnegative().nullable().optional(),
});

// ── Feedback ────────────────────────────────────────

export const FeedbackCreateSchema = z.object({
  call_id: z.string().uuid(),
  rfq_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  category: z.enum([
    "pricing",
    "communication",
    "speed",
    "accuracy",
    "compliance",
    "general",
  ]),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

// ── Dispatch ────────────────────────────────────────

export const DispatchConfigSchema = z.object({
  max_concurrent_calls: z.number().int().min(1).max(20).default(5),
  max_retries: z.number().int().min(0).max(5).default(2),
  retry_delay_seconds: z.number().int().min(10).max(600).default(60),
  call_timeout_seconds: z.number().int().min(60).max(600).default(480),
});

// ── Encryption helpers (for API input validation) ──

export const EncryptedPriceSchema = z
  .string()
  .regex(
    /^\{?"iv":".*?","tag":".*?","ciphertext":".*?"\}?$/,
    "Must be a valid encrypted price payload",
  )
  .nullable()
  .optional();

// ── CSV Import helpers ──────────────────────────────

export const CSVSupplierRowSchema = z.object({
  name: z.string().min(1, "Supplier name is required").max(200),
  phone: z
    .string()
    .min(5, "Phone must be at least 5 characters")
    .max(20)
    .regex(/^\+?[0-9\s\-().]+$/, "Invalid phone number format"),
  country: z.string().max(100).optional().default(""),
  region: z.string().max(50).optional().default(""),
  contact_name: z.string().max(200).optional().default(""),
  language_primary: z.string().max(50).optional().default(""),
});

export const CSVImportSchema = z
  .object({
    organization_id: z.string().uuid("Invalid organization_id"),
    rows: z.array(CSVSupplierRowSchema).min(1, "At least one row required").max(5000, "Maximum 5000 rows per import"),
  })
  .strict();

export type CSVSupplierRow = z.infer<typeof CSVSupplierRowSchema>;
export type CSVImportInput = z.infer<typeof CSVImportSchema>;

// Row-level error reporting
export interface CSVRowError {
  row: number;
  field: string;
  message: string;
  value: string;
}

export interface CSVImportResult {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  errorRows: number;
  insertedCount: number;
  errors: CSVRowError[];
  warnings: string[];
  insertedIds: string[];
}
