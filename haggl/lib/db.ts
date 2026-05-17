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

// ── In-Memory Database Fallback for Offline Demo ──────────
// Pinned to globalThis so all Next.js route bundles (each a separate webpack
// bundle in dev) share ONE in-memory DB instance within the Node process.

const mockDbState = ((globalThis as any).__hagglMockDb ??= {
  users: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      email: "buyer@haggl.ai",
      name: "Demo Buyer",
      organization_id: "00000000-0000-0000-0000-000000000001",
      role: "admin",
      status: "active",
      created_at: new Date().toISOString()
    }
  ],
  suppliers: [
    {
      id: "s1",
      organization_id: "00000000-0000-0000-0000-000000000001",
      name: "Apex Steel Corp",
      phone: "+15550100111",
      email: "sales@apexsteel.com",
      status: "active",
      metadata: { region: "US East" },
      created_at: new Date().toISOString()
    },
    {
      id: "s2",
      organization_id: "00000000-0000-0000-0000-000000000001",
      name: "Summit Plastics",
      phone: "+15550100222",
      email: "info@summitplastics.com",
      status: "active",
      metadata: { region: "US West" },
      created_at: new Date().toISOString()
    },
    {
      id: "s3",
      organization_id: "00000000-0000-0000-0000-000000000001",
      name: "Global Castings Ltd",
      phone: "+15550100333",
      email: "orders@globalcastings.com",
      status: "active",
      metadata: { region: "EU Central" },
      created_at: new Date().toISOString()
    }
  ],
  rfqs: [
    {
      id: "r1",
      organization_id: "00000000-0000-0000-0000-000000000001",
      title: "Precision Stamped Brackets (Grade-A Steel)",
      status: "negotiating",
      target_price: 8.50,
      floor_price: "floor_enc_mock",
      created_at: new Date().toISOString()
    }
  ],
  rfq_suppliers: [
    { id: "rs1", rfq_id: "r1", supplier_id: "s1", status: "pending", priority: 3, supplier: null },
    { id: "rs2", rfq_id: "r1", supplier_id: "s2", status: "pending", priority: 2, supplier: null },
    { id: "rs3", rfq_id: "r1", supplier_id: "s3", status: "pending", priority: 1, supplier: null }
  ],
  calls: [] as any[],
  reasoning_traces: [] as any[],
  feedback: [] as any[],
  dispatch_sessions: [] as any[],
  queue_entries: [] as any[],
  learned_patterns: [] as any[]
});

class MockQueryBuilder {
  private tableName: string;
  private data: any[];

  constructor(tableName: string) {
    this.tableName = tableName;
    const keyMap: Record<string, keyof typeof mockDbState> = {
      users: "users",
      suppliers: "suppliers",
      rfqs: "rfqs",
      rfq_suppliers: "rfq_suppliers",
      calls: "calls",
      reasoning_traces: "reasoning_traces",
      feedback: "feedback",
      dispatch_sessions: "dispatch_sessions",
      queue_entries: "queue_entries",
      learned_patterns: "learned_patterns"
    };
    const dbKey = keyMap[tableName] || (tableName as any);
    if (!mockDbState[dbKey]) {
      mockDbState[dbKey] = [];
    }
    this.data = mockDbState[dbKey];

    // Handle standard relationship joins
    if (dbKey === "rfq_suppliers") {
      this.data.forEach(rs => {
        rs.supplier = mockDbState.suppliers.find((s: any) => s.id === rs.supplier_id) || null;
      });
    }
  }

  select(columns: string = "*") {
    let current = [...this.data];
    const chain = {
      eq: (col: string, val: any) => {
        current = current.filter(item => item[col] === val);
        return chain;
      },
      not: (col: string, op: string, val: any) => {
        current = current.filter(item => item[col] !== val);
        return chain;
      },
      in: (col: string, arr: any[]) => {
        current = current.filter(item => arr.includes(item[col]));
        return chain;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        current.sort((a, b) => {
          const valA = a[col];
          const valB = b[col];
          if (valA < valB) return opts?.ascending ? -1 : 1;
          if (valA > valB) return opts?.ascending ? 1 : -1;
          return 0;
        });
        return chain;
      },
      limit: (val: number) => {
        current = current.slice(0, val);
        return chain;
      },
      single: async () => {
        if (current.length === 0) return { data: null, error: null };
        return { data: current[0], error: null };
      },
      then: (resolve: any) => {
        resolve({ data: current, error: null });
      }
    };
    return chain;
  }

  insert(payload: any) {
    const records = Array.isArray(payload) ? payload : [payload];
    const inserted: any[] = [];
    records.forEach(rec => {
      const newRec = {
        id: rec.id || Math.random().toString(36).substr(2, 9),
        created_at: new Date().toISOString(),
        ...rec
      };
      this.data.push(newRec);
      inserted.push(newRec);
    });

    const chain = {
      select: () => {
        return {
          single: async () => {
            return { data: inserted[0], error: null };
          },
          then: (resolve: any) => resolve({ data: inserted, error: null })
        };
      },
      then: (resolve: any) => resolve({ data: inserted, error: null })
    };
    return chain;
  }

  update(payload: any) {
    let affected: any[] = [];
    const chain = {
      eq: (col: string, val: any) => {
        this.data.forEach(item => {
          if (item[col] === val) {
            Object.assign(item, payload);
            affected.push(item);
          }
        });
        return chain;
      },
      select: () => {
        return {
          single: async () => {
            return { data: affected[0], error: null };
          },
          then: (resolve: any) => resolve({ data: affected, error: null })
        };
      },
      then: (resolve: any) => resolve({ data: affected, error: null })
    };
    return chain;
  }

  upsert(payload: any, opts?: { onConflict?: string }) {
    const records = Array.isArray(payload) ? payload : [payload];
    const result: any[] = [];
    const conflictKey = opts?.onConflict;
    records.forEach(rec => {
      const existing =
        conflictKey && rec[conflictKey] !== undefined
          ? this.data.find(item => item[conflictKey] === rec[conflictKey])
          : undefined;
      if (existing) {
        Object.assign(existing, rec);
        result.push(existing);
      } else {
        const newRec = {
          id: rec.id || Math.random().toString(36).substr(2, 9),
          created_at: new Date().toISOString(),
          ...rec,
        };
        this.data.push(newRec);
        result.push(newRec);
      }
    });

    const chain = {
      select: () => ({
        single: async () => ({ data: result[0], error: null }),
        then: (resolve: any) => resolve({ data: result, error: null }),
      }),
      then: (resolve: any) => resolve({ data: result, error: null }),
    };
    return chain;
  }
}

// ── Client factory ──────────────────────────────────

let _serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (process.env.DEMO_MODE === "true") {
      console.warn("[db] Supabase credentials missing. Booting high-fidelity local in-memory DB.");
      _serviceClient = {
        from: (table: string) => new MockQueryBuilder(table)
      } as any;
      return _serviceClient!;
    }
    throw new Error("Supabase credentials not configured");
  }

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
  get dispatch_sessions() {
    return getServiceClient().from("dispatch_sessions");
  },
  get queue_entries() {
    return getServiceClient().from("queue_entries");
  },
  get learned_patterns() {
    return getServiceClient().from("learned_patterns");
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
