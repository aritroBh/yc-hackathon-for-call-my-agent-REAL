import { EventEmitter } from "node:events";
import { tables, getRFQById, getSuppliersForRFQ } from "@/lib/db";
import { getCallQueue, type QueueEntry } from "@/lib/queue";
import type { RFQRow, RFQSupplierRow, SupplierRow, CallRow } from "@/types/database";

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

  async dispatchRFQ(rfqId: string, organizationId: string): Promise<DispatchSession> {
    const rfq = await getRFQById(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    if (rfq.organization_id !== organizationId) {
      throw new Error("RFQ does not belong to this organization");
    }

    const existing = this.activeSessions.get(rfqId);
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
      this.emit("dispatch_progress" as any, { ...session });
    }

    return session;
  }

  private async createCallRecord(
    rfqId: string,
    supplierId: string,
    rfqSupplierId: string,
  ): Promise<string> {
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
    return (data as CallRow).id;
  }

  completeSession(rfqId: string): void {
    const session = this.activeSessions.get(rfqId);
    if (!session) return;
    session.status = "completed";
    session.completedAt = Date.now();
    this.emit("dispatch_completed" as any, { ...session });
    this.activeSessions.delete(rfqId);
  }

  failSession(rfqId: string, error: string): void {
    const session = this.activeSessions.get(rfqId);
    if (!session) return;
    session.status = "failed";
    session.completedAt = Date.now();
    this.emit("dispatch_failed" as any, { ...session }, error);
    this.activeSessions.delete(rfqId);
  }

  incrementCompleted(rfqId: string): void {
    const session = this.activeSessions.get(rfqId);
    if (!session) return;
    session.completed++;
    this.emit("dispatch_progress" as any, { ...session });
    if (session.completed + session.failed >= session.totalSuppliers) {
      this.completeSession(rfqId);
    }
  }

  incrementFailed(rfqId: string): void {
    const session = this.activeSessions.get(rfqId);
    if (!session) return;
    session.failed++;
    this.emit("dispatch_progress" as any, { ...session });
    if (session.completed + session.failed >= session.totalSuppliers) {
      this.completeSession(rfqId);
    }
  }

  getSession(rfqId: string): DispatchSession | undefined {
    return this.activeSessions.get(rfqId);
  }

  getActiveSessions(): DispatchSession[] {
    return Array.from(this.activeSessions.values());
  }

  cancelSession(rfqId: string): void {
    const session = this.activeSessions.get(rfqId);
    if (!session) return;
    session.status = "failed";
    session.completedAt = Date.now();
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
