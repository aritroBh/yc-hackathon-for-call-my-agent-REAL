import { EventEmitter } from "node:events";
import { tables } from "@/lib/db";

export type QueueStatus =
  | "pending"
  | "queued"
  | "calling"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer"
  | "capped";

export interface QueueEntry {
  callId: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  phone: string;
  priority: number;
  status: QueueStatus;
  attempt: number;
  maxAttempts: number;
  error: string | null;
  queuedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  twilioCallSid: string | null;
  result: Record<string, unknown> | null;
}

export interface QueueEvents {
  enqueued: [entry: QueueEntry];
  dequeued: [entry: QueueEntry];
  status_change: [callId: string, status: QueueStatus, prev: QueueStatus];
  completed: [entry: QueueEntry];
  failed: [entry: QueueEntry, error: string];
  retrying: [entry: QueueEntry, attempt: number];
  drained: [];
}

export class CallQueue extends EventEmitter {
  private entries: QueueEntry[] = [];
  private inFlight = new Map<string, QueueEntry>();
  private maxConcurrent: number;
  private callsPerSecond: number;
  private lastCallTimestamps: number[] = [];
  private hydrated = false;

  constructor(opts?: {
    maxConcurrent?: number;
    callsPerSecond?: number;
    persistDir?: string;
  }) {
    super();
    this.maxConcurrent = opts?.maxConcurrent ?? 5;
    this.callsPerSecond = opts?.callsPerSecond ?? 1;
  }

  async hydrateFromDB(): Promise<void> {
    if (this.hydrated) return;
    const { data } = await tables.queue_entries.select("*").in("status", ["pending", "in_flight", "queued", "calling"]);
    if (data) {
      for (const row of data as any[]) {
        const entry: QueueEntry = {
          callId: row.call_id,
          rfqId: row.rfq_id,
          supplierId: row.supplier_id,
          supplierName: row.supplier_name,
          phone: row.phone,
          priority: row.priority,
          status: row.status as QueueStatus,
          attempt: row.attempt,
          maxAttempts: row.max_attempts,
          error: row.error,
          queuedAt: new Date(row.queued_at).getTime(),
          startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
          completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
          twilioCallSid: row.twilio_call_sid,
          result: null,
        };
        if (["pending"].includes(entry.status)) {
          this.entries.push(entry);
        } else {
          this.inFlight.set(entry.callId, entry);
        }
      }
      this.entries.sort((a, b) => b.priority - a.priority);
    }
    this.hydrated = true;
  }

  async enqueue(entry: QueueEntry): Promise<void> {
    const insertAt = this.entries.findIndex((e) => e.priority < entry.priority);
    if (insertAt === -1) {
      this.entries.push(entry);
    } else {
      this.entries.splice(insertAt, 0, entry);
    }
    this.emit("enqueued" as any, entry);
    
    await tables.queue_entries.insert({
      call_id: entry.callId,
      rfq_id: entry.rfqId,
      supplier_id: entry.supplierId,
      supplier_name: entry.supplierName,
      phone: entry.phone,
      priority: entry.priority,
      status: entry.status,
      attempt: entry.attempt,
      max_attempts: entry.maxAttempts,
      error: entry.error,
      queued_at: new Date(entry.queuedAt).toISOString(),
      started_at: entry.startedAt ? new Date(entry.startedAt).toISOString() : null,
      completed_at: entry.completedAt ? new Date(entry.completedAt).toISOString() : null,
      twilio_call_sid: entry.twilioCallSid,
    });
  }

  async enqueueBatch(entries: QueueEntry[]): Promise<void> {
    for (const e of entries) {
      await this.enqueue(e);
    }
  }

  async dequeue(): Promise<QueueEntry | null> {
    if (this.inFlight.size >= this.maxConcurrent) return null;
    if (!this.canMakeCall()) return null;

    const idx = this.entries.findIndex(
      (e) => e.status === "pending" && e.attempt < e.maxAttempts,
    );
    if (idx === -1) return null;

    const entry = this.entries[idx];

    // Atomic DB update
    const { data, error } = await tables.queue_entries
      .update({ status: "queued", started_at: new Date().toISOString() })
      .eq("call_id", entry.callId)
      .eq("status", "pending")
      .select()
      .single();

    if (error || !data) return null;

    entry.status = "queued";
    entry.startedAt = Date.now();
    this.entries.splice(idx, 1);
    this.inFlight.set(entry.callId, entry);

    this.emit("dequeued" as any, entry);
    this.emit("status_change" as any, entry.callId, "queued", "pending");
    return entry;
  }

  async complete(callId: string, result?: Record<string, unknown>): Promise<void> {
    const entry = this.inFlight.get(callId);
    if (!entry) return;
    entry.status = "completed";
    entry.completedAt = Date.now();
    entry.result = result ?? null;
    this.inFlight.delete(callId);
    
    await tables.queue_entries.update({ status: "completed", completed_at: new Date().toISOString() }).eq("call_id", callId);

    this.emit("status_change" as any, callId, "completed", "queued");
    this.emit("completed" as any, entry);
    if (this.entries.length === 0 && this.inFlight.size === 0) {
      this.emit("drained" as any);
    }
  }

  async fail(callId: string, error: string): Promise<void> {
    const entry = this.inFlight.get(callId);
    if (!entry) {
      const pending = this.entries.find((e) => e.callId === callId);
      if (pending) {
        pending.attempt++;
        pending.error = error;
        if (pending.attempt >= pending.maxAttempts) {
          pending.status = "failed";
          pending.completedAt = Date.now();
          await tables.queue_entries.update({ status: "failed", completed_at: new Date().toISOString(), attempt: pending.attempt, error }).eq("call_id", callId);
          this.emit("status_change" as any, callId, "failed", pending.status);
          this.emit("failed" as any, pending, error);
        } else {
          pending.status = "pending";
          await tables.queue_entries.update({ status: "pending", attempt: pending.attempt, error }).eq("call_id", callId);
          this.emit("retrying" as any, pending, pending.attempt);
        }
      }
      return;
    }

    entry.attempt++;
    entry.error = error;
    this.inFlight.delete(callId);
    this.emit("status_change" as any, callId, "failed", "queued");

    if (entry.attempt < entry.maxAttempts) {
      entry.status = "pending";
      this.entries.push(entry);
      await tables.queue_entries.update({ status: "pending", attempt: entry.attempt, error }).eq("call_id", callId);
      this.emit("retrying" as any, entry, entry.attempt);
    } else {
      entry.status = "failed";
      entry.completedAt = Date.now();
      await tables.queue_entries.update({ status: "failed", completed_at: new Date().toISOString(), attempt: entry.attempt, error }).eq("call_id", callId);
      this.emit("failed" as any, entry, error);
    }

    if (this.entries.length === 0 && this.inFlight.size === 0) {
      this.emit("drained" as any);
    }
  }

  async updateStatus(callId: string, status: QueueStatus): Promise<void> {
    const entry =
      this.inFlight.get(callId) ||
      this.entries.find((e) => e.callId === callId);
    if (!entry) return;
    const prev = entry.status;
    entry.status = status;
    await tables.queue_entries.update({ status }).eq("call_id", callId);
    this.emit("status_change" as any, callId, status, prev);
  }

  async markCalling(callId: string, twilioSid: string): Promise<void> {
    const entry = this.inFlight.get(callId);
    if (!entry) return;
    entry.status = "calling";
    entry.twilioCallSid = twilioSid;
    await tables.queue_entries.update({ status: "calling", twilio_call_sid: twilioSid }).eq("call_id", callId);
    this.emit("status_change" as any, callId, "calling", "queued");
  }

  getPendingCount(): number {
    return this.entries.filter((e) => e.status === "pending").length;
  }

  getInFlightCount(): number {
    return this.inFlight.size;
  }

  getQueueLength(): number {
    return this.entries.length;
  }

  getAll(): QueueEntry[] {
    const result: QueueEntry[] = [];
    this.entries.forEach((e) => result.push(e));
    this.inFlight.forEach((e) => result.push(e));
    return result;
  }

  getByCallId(callId: string): QueueEntry | undefined {
    return (
      this.inFlight.get(callId) ||
      this.entries.find((e) => e.callId === callId)
    );
  }

  getByRFQ(rfqId: string): QueueEntry[] {
    return this.getAll().filter((e) => e.rfqId === rfqId);
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = Math.max(1, Math.min(50, n));
  }

  getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  setCallsPerSecond(n: number): void {
    this.callsPerSecond = Math.max(0.25, Math.min(10, n));
  }

  private canMakeCall(): boolean {
    if (this.callsPerSecond <= 0) return true;
    const now = Date.now();
    const windowMs = 1000;
    this.lastCallTimestamps = this.lastCallTimestamps.filter(
      (t) => now - t < windowMs,
    );
    const maxInWindow = Math.ceil(this.callsPerSecond);
    return this.lastCallTimestamps.length < maxInWindow;
  }

  recordCallStart(): void {
    this.lastCallTimestamps.push(Date.now());
  }

  destroy(): void {
    this.removeAllListeners();
    this.entries = [];
    this.inFlight.clear();
  }
}

let _globalQueue: CallQueue | null = null;

export function getCallQueue(opts?: {
  maxConcurrent?: number;
  callsPerSecond?: number;
  persistDir?: string;
}): CallQueue {
  if (!_globalQueue) {
    _globalQueue = new CallQueue(opts);
  }
  return _globalQueue;
}
