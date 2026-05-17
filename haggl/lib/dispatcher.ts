import { EventEmitter } from "node:events";
import { tables, getRFQById, getSuppliersForRFQ, getSupplierById } from "@/lib/db";
import { getCallQueue, type QueueEntry } from "@/lib/queue";
import type { RFQRow, RFQSupplierRow, SupplierRow, CallRow } from "@/types/database";
import { researchSupplier } from "@/lib/sponsors/browseruse";

export type DispatchStatus =
  | "idle"
  | "dispatching"
  | "paused"
  | "completed"
  | "failed";

export interface DispatchSession {
  id: string;
  rfqId: string;
  organizationId: string;
  status: DispatchStatus;
  totalSuppliers: number;
  dispatched: number;
  completed: number;
  failed: number;
  startedAt: number;
  completedAt: number | null;
}

export interface DispatchEvents {
  dispatch_started: [session: DispatchSession];
  dispatch_progress: [session: DispatchSession];
  dispatch_completed: [session: DispatchSession];
  dispatch_failed: [session: DispatchSession, error: string];
  call_created: [callId: string, supplierId: string, rfqId: string];
  call_queued: [callId: string, entry: QueueEntry];
  call_dispatched: [callId: string, twilioSid: string];
  call_retrying: [callId: string, attempt: number, error: string];
  supplier_skipped: [supplierId: string, reason: string];
}

export interface DispatchConfig {
  maxConcurrent: number;
  maxRetries: number;
  retryDelayMs: number;
  callsPerSecond: number;
  staggerMinMs: number;
  staggerMaxMs: number;
  callTimeoutSeconds: number;
}

const DEFAULT_CONFIG: DispatchConfig = {
  maxConcurrent: 5,
  maxRetries: 2,
  retryDelayMs: 30_000,
  callsPerSecond: 1,
  staggerMinMs: 500,
  staggerMaxMs: 3_000,
  callTimeoutSeconds: 480,
};

function jitter(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class Dispatcher extends EventEmitter {
  private activeSessions = new Map<string, DispatchSession>();
  private config: DispatchConfig;

  constructor(config?: Partial<DispatchConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async hydrateFromDB(rfqId: string): Promise<DispatchSession | undefined> {
    const { data } = await tables.dispatch_sessions.select("*").eq("rfq_id", rfqId).order("started_at", { ascending: false }).limit(1).single();
    if (data) {
      const session: DispatchSession = {
        id: data.id,
        rfqId: data.rfq_id,
        organizationId: data.organization_id,
        status: data.status as DispatchStatus,
        totalSuppliers: data.total_suppliers,
        dispatched: data.dispatched,
        completed: data.completed,
        failed: data.failed,
        startedAt: new Date(data.started_at).getTime(),
        completedAt: data.completed_at ? new Date(data.completed_at).getTime() : null,
      };
      this.activeSessions.set(rfqId, session);
      return session;
    }
    return undefined;
  }

  async dispatchRFQ(rfqId: string, organizationId: string): Promise<DispatchSession> {
    const rfq = await getRFQById(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    if (rfq.organization_id !== organizationId) {
      throw new Error("RFQ does not belong to this organization");
    }

    const existing = await this.getSession(rfqId);
    if (existing && (existing.status === "dispatching")) {
      throw new Error(`RFQ ${rfqId} is already being dispatched`);
    }

    const rfqSuppliers = await getSuppliersForRFQ(rfqId);
    const validSuppliers = rfqSuppliers.filter(
      (rs) => rs.supplier && rs.supplier.phone,
    );

    if (validSuppliers.length === 0) {
      throw new Error("No suppliers with valid phone numbers linked to this RFQ");
    }

    const session: DispatchSession = {
      id: rfqId,
      rfqId,
      organizationId,
      status: "dispatching",
      totalSuppliers: validSuppliers.length,
      dispatched: 0,
      completed: 0,
      failed: 0,
      startedAt: Date.now(),
      completedAt: null,
    };

    const { data: insertedSession } = await tables.dispatch_sessions.insert({
      rfq_id: rfqId,
      organization_id: organizationId,
      status: "dispatching",
      total_suppliers: validSuppliers.length,
      dispatched: 0,
      completed: 0,
      failed: 0,
      started_at: new Date(session.startedAt).toISOString(),
    }).select().single();
    
    if (insertedSession) {
      session.id = insertedSession.id;
    }

    this.activeSessions.set(rfqId, session);
    this.emit("dispatch_started" as any, session);

    await tables.rfqs.update({ status: "negotiating" }).eq("id", rfqId);

    const queue = getCallQueue({
      maxConcurrent: this.config.maxConcurrent,
      callsPerSecond: this.config.callsPerSecond,
      persistDir: process.env.HAGGL_DATA_DIR || "./data",
    });

    const queueEntries: QueueEntry[] = [];

    for (const rs of validSuppliers) {
      const supplier = rs.supplier!;
      const callId = await this.createCallRecord(rfqId, supplier.id, rs.id);

      const entry: QueueEntry = {
        callId,
        rfqId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        phone: supplier.phone,
        priority: rs.priority,
        status: "pending",
        attempt: 0,
        maxAttempts: this.config.maxRetries + 1,
        error: null,
        queuedAt: Date.now(),
        startedAt: null,
        completedAt: null,
        twilioCallSid: null,
        result: null,
      };

      queueEntries.push(entry);
      this.emit("call_created" as any, callId, supplier.id, rfqId);

      await tables.rfq_suppliers.update({ status: "contacted" }).eq("id", rs.id);
    }

    const batchSize = this.config.maxConcurrent;
    const shuffled = this.shuffleWithPriority(queueEntries);

    for (const entry of shuffled) {
      const delay = jitter(this.config.staggerMinMs, this.config.staggerMaxMs);
      await this.sleep(delay);
      queue.enqueue(entry);
      this.emit("call_queued" as any, entry.callId, entry);
      session.dispatched++;
      await tables.dispatch_sessions.update({ dispatched: session.dispatched }).eq("id", session.id);
      this.emit("dispatch_progress" as any, { ...session });
    }

    return session;
  }

  private async createCallRecord(
    rfqId: string,
    supplierId: string,
    rfqSupplierId: string,
  ): Promise<string> {
    const { data: existingCalls } = await tables.calls
      .select("id")
      .eq("rfq_id", rfqId)
      .eq("supplier_id", supplierId)
      .not("status", "in", '("failed","no_answer","rejected")')
      .limit(1);

    if (existingCalls && existingCalls.length > 0) {
      const existingId = existingCalls[0].id;
      console.warn(`[Dispatcher] Skipping duplicate call for supplier ${supplierId} on RFQ ${rfqId} — existing call ${existingId}`);
      return existingId;
    }

    const { data, error } = await tables.calls
      .insert({
        rfq_id: rfqId,
        supplier_id: supplierId,
        rfq_supplier_id: rfqSupplierId,
        twilio_call_sid: null,
        stream_sid: null,
        status: "pending",
        phase: "greeting",
        duration_seconds: null,
        cost_millicents: null,
        transcript: [],
        result: null,
        error_message: null,
        started_at: null,
        ended_at: null,
        initiated_by: null,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to create call record: ${error?.message}`);

    // Asynchronously research supplier in background using Browser Use
    (async () => {
      try {
        const supplier = await getSupplierById(supplierId);
        const rfq = await getRFQById(rfqId);
        if (supplier && rfq) {
          console.log(`[Dispatcher] Starting Browser Use pre-call research for ${supplier.name}...`);
          const research = await researchSupplier(supplier.name, rfq.title);
          if (research) {
            await tables.calls.update({
              result: { pre_call_research: research }
            }).eq("id", data.id);
            console.log(`[Dispatcher] Browser Use research complete for ${supplier.name}`);
          }
        }
      } catch (err: any) {
        console.warn("[Dispatcher] Browser Use pre-call research failed:", err.message);
      }
    })();

    return (data as CallRow).id;
  }

  async completeSession(rfqId: string): Promise<void> {
    const session = await this.getSession(rfqId);
    if (!session) return;
    session.status = "completed";
    session.completedAt = Date.now();
    await tables.dispatch_sessions.update({ status: "completed", completed_at: new Date(session.completedAt).toISOString() }).eq("id", session.id);
    this.emit("dispatch_completed" as any, { ...session });
    this.activeSessions.delete(rfqId);
  }

  async failSession(rfqId: string, error: string): Promise<void> {
    const session = await this.getSession(rfqId);
    if (!session) return;
    session.status = "failed";
    session.completedAt = Date.now();
    await tables.dispatch_sessions.update({ status: "failed", completed_at: new Date(session.completedAt).toISOString() }).eq("id", session.id);
    this.emit("dispatch_failed" as any, { ...session }, error);
    this.activeSessions.delete(rfqId);
  }

  async incrementCompleted(rfqId: string): Promise<void> {
    const session = await this.getSession(rfqId);
    if (!session) return;
    session.completed++;
    await tables.dispatch_sessions.update({ completed: session.completed }).eq("id", session.id);
    this.emit("dispatch_progress" as any, { ...session });
    if (session.completed + session.failed >= session.totalSuppliers) {
      await this.completeSession(rfqId);
    }
  }

  async incrementFailed(rfqId: string): Promise<void> {
    const session = await this.getSession(rfqId);
    if (!session) return;
    session.failed++;
    await tables.dispatch_sessions.update({ failed: session.failed }).eq("id", session.id);
    this.emit("dispatch_progress" as any, { ...session });
    if (session.completed + session.failed >= session.totalSuppliers) {
      await this.completeSession(rfqId);
    }
  }

  async getSession(rfqId: string): Promise<DispatchSession | undefined> {
    let session = this.activeSessions.get(rfqId);
    if (!session) {
      session = await this.hydrateFromDB(rfqId);
    }
    return session;
  }

  getActiveSessions(): DispatchSession[] {
    return Array.from(this.activeSessions.values());
  }

  async cancelSession(rfqId: string): Promise<void> {
    const session = await this.getSession(rfqId);
    if (!session) return;
    session.status = "failed";
    session.completedAt = Date.now();
    await tables.dispatch_sessions.update({ status: "failed", completed_at: new Date(session.completedAt).toISOString() }).eq("id", session.id);
    this.emit("dispatch_failed" as any, { ...session }, "Cancelled by user");
    this.activeSessions.delete(rfqId);
  }

  updateConfig(partial: Partial<DispatchConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): DispatchConfig {
    return { ...this.config };
  }

  private shuffleWithPriority(entries: QueueEntry[]): QueueEntry[] {
    const sorted = [...entries].sort((a, b) => b.priority - a.priority);
    const groups: QueueEntry[][] = [];
    let currentGroup: QueueEntry[] = [];

    for (const entry of sorted) {
      currentGroup.push(entry);
      if (currentGroup.length >= 3) {
        this.shuffleArray(currentGroup);
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
    if (currentGroup.length > 0) {
      this.shuffleArray(currentGroup);
      groups.push(currentGroup);
    }

    const result: QueueEntry[] = [];
    for (const g of groups) result.push(...g);
    return result;
  }

  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

let _globalDispatcher: Dispatcher | null = null;

export function getDispatcher(config?: Partial<DispatchConfig>): Dispatcher {
  if (!_globalDispatcher) {
    _globalDispatcher = new Dispatcher(config);
  }
  return _globalDispatcher;
}
