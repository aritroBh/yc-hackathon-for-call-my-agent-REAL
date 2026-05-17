import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  encryptFloorPrice,
  decryptFloorPrice,
  encryptFloorPriceSafe,
  decryptFloorPriceSafe,
} from "@/lib/encryption";
import type {
  UserRow,
  SupplierRow,
  DialectConfigRow,
  RFQRow,
  RFQSupplierRow,
  CallRow,
  ReasoningTraceRow,
  FeedbackRow,
} from "@/types/database";

// ── Client factory ──────────────────────────────────

let _serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");
  _serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _serviceClient;
}

export function getDb(): SupabaseClient {
  return getServiceClient();
}

// ── Table accessors ─────────────────────────────────

export const tables = {
  get users() {
    return getServiceClient().from("users");
  },
  get suppliers() {
    return getServiceClient().from("suppliers");
  },
  get dialect_configs() {
    return getServiceClient().from("dialect_configs");
  },
  get rfqs() {
    return getServiceClient().from("rfqs");
  },
  get rfq_suppliers() {
    return getServiceClient().from("rfq_suppliers");
  },
  get calls() {
    return getServiceClient().from("calls");
  },
  get reasoning_traces() {
    return getServiceClient().from("reasoning_traces");
  },
  get feedback() {
    return getServiceClient().from("feedback");
  },
};

// ── User queries ────────────────────────────────────

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data } = await tables.users.select("*").eq("id", id).single();
  return data as UserRow | null;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data } = await tables.users.select("*").eq("email", email).single();
  return data as UserRow | null;
}

export async function listUsersByOrganization(
  orgId: string,
): Promise<UserRow[]> {
  const { data } = await tables.users
    .select("*")
    .eq("organization_id", orgId)
    .order("name");
  return (data as UserRow[]) || [];
}

// ── Supplier queries ─────────────────────────────────

export async function getSupplierById(id: string): Promise<SupplierRow | null> {
  const { data } = await tables.suppliers.select("*").eq("id", id).single();
  return data as SupplierRow | null;
}

export async function listSuppliersByOrganization(
  orgId: string,
): Promise<SupplierRow[]> {
  const { data } = await tables.suppliers
    .select("*")
    .eq("organization_id", orgId)
    .order("name");
  return (data as SupplierRow[]) || [];
}

export async function listActiveSuppliersByOrganization(
  orgId: string,
): Promise<SupplierRow[]> {
  const { data } = await tables.suppliers
    .select("*")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .order("name");
  return (data as SupplierRow[]) || [];
}

// ── Dialect config queries ──────────────────────────

export async function getDialectById(
  id: string,
): Promise<DialectConfigRow | null> {
  const { data } = await tables.dialect_configs
    .select("*")
    .eq("id", id)
    .single();
  return data as DialectConfigRow | null;
}

export async function getDialectByLocale(
  locale: string,
): Promise<DialectConfigRow | null> {
  const { data } = await tables.dialect_configs
    .select("*")
    .eq("locale", locale)
    .eq("is_active", true)
    .single();
  return data as DialectConfigRow | null;
}

export async function listActiveDialects(): Promise<DialectConfigRow[]> {
  const { data } = await tables.dialect_configs
    .select("*")
    .eq("is_active", true)
    .order("name");
  return (data as DialectConfigRow[]) || [];
}

// ── RFQ queries ─────────────────────────────────────

export async function getRFQById(id: string): Promise<RFQRow | null> {
  const { data } = await tables.rfqs.select("*").eq("id", id).single();
  return data as RFQRow | null;
}

export async function listRFQsByOrganization(
  orgId: string,
): Promise<RFQRow[]> {
  const { data } = await tables.rfqs
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  return (data as RFQRow[]) || [];
}

export async function createRFQ(
  input: Omit<RFQRow, "id" | "created_at" | "updated_at">,
): Promise<RFQRow> {
  const payload = { ...input };
  if (input.floor_price) {
    payload.floor_price = encryptFloorPriceSafe(input.floor_price as unknown as number);
  }
  const { data, error } = await tables.rfqs
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as RFQRow;
}

export async function getDecryptedFloorPrice(
  rfqId: string,
): Promise<number | null> {
  const rfq = await getRFQById(rfqId);
  if (!rfq?.floor_price) return null;
  return decryptFloorPriceSafe(rfq.floor_price);
}

// ── RFQ-Supplier link queries ───────────────────────

export async function linkSupplierToRFQ(
  rfqId: string,
  supplierId: string,
  dialectId?: string,
  priority?: number,
): Promise<RFQSupplierRow> {
  const { data, error } = await tables.rfq_suppliers
    .insert({
      rfq_id: rfqId,
      supplier_id: supplierId,
      dialect_id: dialectId || null,
      priority: priority ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data as RFQSupplierRow;
}

export async function getSuppliersForRFQ(
  rfqId: string,
): Promise<(RFQSupplierRow & { supplier: SupplierRow | null })[]> {
  const { data } = await tables.rfq_suppliers
    .select("*, supplier:suppliers(*)")
    .eq("rfq_id", rfqId)
    .order("priority", { ascending: false });
  return (data as any[]) || [];
}

// ── Call queries ────────────────────────────────────

export async function getCallById(id: string): Promise<CallRow | null> {
  const { data } = await tables.calls.select("*").eq("id", id).single();
  return data as CallRow | null;
}

export async function listCallsByRFQ(rfqId: string): Promise<CallRow[]> {
  const { data } = await tables.calls
    .select("*")
    .eq("rfq_id", rfqId)
    .order("created_at", { ascending: false });
  return (data as CallRow[]) || [];
}

export async function listActiveCalls(): Promise<CallRow[]> {
  const { data } = await tables.calls
    .select("*")
    .in("status", [
      "pending",
      "queued",
      "ringing",
      "in_progress",
    ])
    .order("created_at");
  return (data as CallRow[]) || [];
}

export async function getCallByTwilioSid(
  twilioSid: string,
): Promise<CallRow | null> {
  const { data } = await tables.calls
    .select("*")
    .eq("twilio_call_sid", twilioSid)
    .single();
  return data as CallRow | null;
}

export async function updateCallStatus(
  id: string,
  updates: Partial<
    Pick<
      CallRow,
      | "status"
      | "phase"
      | "duration_seconds"
      | "cost_millicents"
      | "transcript"
      | "result"
      | "error_message"
      | "ended_at"
      | "twilio_call_sid"
      | "stream_sid"
    >
  >,
): Promise<void> {
  const { error } = await tables.calls
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

// ── Reasoning trace queries ─────────────────────────

export async function insertReasoningTrace(
  input: Omit<ReasoningTraceRow, "id" | "created_at">,
): Promise<ReasoningTraceRow> {
  const { data, error } = await tables.reasoning_traces
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ReasoningTraceRow;
}

export async function listTracesByCall(
  callId: string,
): Promise<ReasoningTraceRow[]> {
  const { data } = await tables.reasoning_traces
    .select("*")
    .eq("call_id", callId)
    .order("created_at");
  return (data as ReasoningTraceRow[]) || [];
}

// ── Feedback queries ────────────────────────────────

export async function insertFeedback(
  input: Omit<FeedbackRow, "id" | "created_at">,
): Promise<FeedbackRow> {
  const { data, error } = await tables.feedback
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as FeedbackRow;
}

export async function listFeedbackByRFQ(
  rfqId: string,
): Promise<FeedbackRow[]> {
  const { data } = await tables.feedback
    .select("*")
    .eq("rfq_id", rfqId)
    .order("created_at", { ascending: false });
  return (data as FeedbackRow[]) || [];
}

export async function listFeedbackByCall(
  callId: string,
): Promise<FeedbackRow[]> {
  const { data } = await tables.feedback
    .select("*")
    .eq("call_id", callId)
    .order("created_at", { ascending: false });
  return (data as FeedbackRow[]) || [];
}

export async function getAverageRatingForSupplier(
  supplierId: string,
): Promise<number | null> {
  const { data } = await tables.feedback
    .select("rating")
    .eq("supplier_id", supplierId);
  if (!data || data.length === 0) return null;
  const ratings = (data as Pick<FeedbackRow, "rating">[]).map(
    (r) => r.rating,
  );
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}
