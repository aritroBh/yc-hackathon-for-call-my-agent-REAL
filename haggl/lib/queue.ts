import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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
  private persistPath: string | null = null;
  private persistInterval: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(opts?: {
    maxConcurrent?: number;
    callsPerSecond?: number;
    persistDir?: string;
  }) {
    super();
    this.maxConcurrent = opts?.maxConcurrent ?? 5;
    this.callsPerSecond = opts?.callsPerSecond ?? 1;

    if (opts?.persistDir) {
      this.persistPath = join(opts.persistDir, "call_queue.json");
      try {
        mkdirSync(opts.persistDir, { recursive: true });
      } catch {}
      this.loadPersisted();
      this.persistInterval = setInterval(() => this.persist(), 10_000);
    }
  }

  enqueue(entry: QueueEntry): void {
    const insertAt = this.entries.findIndex((e) => e.priority < entry.priority);
    if (insertAt === -1) {
      this.entries.push(entry);
    } else {
      this.entries.splice(insertAt, 0, entry);
    }
    this.emit("enqueued" as any, entry);
    this.persist();
  }

  enqueueBatch(entries: QueueEntry[]): void {
    entries.forEach((e) => this.enqueue(e));
  }

  dequeue(): QueueEntry | null {
    if (this.inFlight.size >= this.maxConcurrent) return null;
    if (!this.canMakeCall()) return null;

    const idx = this.entries.findIndex(
      (e) => e.status === "pending" && e.attempt < e.maxAttempts,
    );
    if (idx === -1) return null;

    const entry = this.entries[idx];
    entry.status = "queued";
    entry.startedAt = Date.now();
    this.entries.splice(idx, 1);
    this.inFlight.set(entry.callId, entry);

    this.emit("dequeued" as any, entry);
    this.emit("status_change" as any, entry.callId, "queued", "pending");
    this.persist();
    return entry;
  }

  complete(callId: string, result?: Record<string, unknown>): void {
    const entry = this.inFlight.get(callId);
    if (!entry) return;
    entry.status = "completed";
    entry.completedAt = Date.now();
    entry.result = result ?? null;
    this.inFlight.delete(callId);
    this.emit("status_change" as any, callId, "completed", "queued");
    this.emit("completed" as any, entry);
    this.persist();
    if (this.entries.length === 0 && this.inFlight.size === 0) {
      this.emit("drained" as any);
    }
  }

  fail(callId: string, error: string): void {
    const entry = this.inFlight.get(callId);
    if (!entry) {
      const pending = this.entries.find((e) => e.callId === callId);
      if (pending) {
        pending.attempt++;
        pending.error = error;
        if (pending.attempt >= pending.maxAttempts) {
          pending.status = "failed";
          pending.completedAt = Date.now();
          this.emit("status_change" as any, callId, "failed", pending.status);
          this.emit("failed" as any, pending, error);
        } else {
          pending.status = "pending";
          this.emit("retrying" as any, pending, pending.attempt);
        }
        this.persist();
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
      this.emit("retrying" as any, entry, entry.attempt);
    } else {
      entry.status = "failed";
      entry.completedAt = Date.now();
      this.emit("failed" as any, entry, error);
    }
    this.persist();
    if (this.entries.length === 0 && this.inFlight.size === 0) {
      this.emit("drained" as any);
    }
  }

  updateStatus(callId: string, status: QueueStatus): void {
    const entry =
      this.inFlight.get(callId) ||
      this.entries.find((e) => e.callId === callId);
    if (!entry) return;
    const prev = entry.status;
    entry.status = status;
    this.emit("status_change" as any, callId, status, prev);
  }

  markCalling(callId: string, twilioSid: string): void {
    const entry = this.inFlight.get(callId);
    if (!entry) return;
    entry.status = "calling";
    entry.twilioCallSid = twilioSid;
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
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
      this.persistInterval = null;
    }
    this.persist();
    this.removeAllListeners();
    this.entries = [];
    this.inFlight.clear();
  }

  private persist(): void {
    if (!this.persistPath) return;
    try {
      const data = {
        entries: this.entries,
        inFlight: (() => { const arr: QueueEntry[] = []; this.inFlight.forEach((v) => arr.push(v)); return arr; })(),
        lastCallTimestamps: this.lastCallTimestamps,
      };
      writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch {}
  }

  private loadPersisted(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const raw = readFileSync(this.persistPath, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.entries)) this.entries = data.entries;
      if (Array.isArray(data.inFlight)) {
        data.inFlight.forEach((entry: QueueEntry) => {
          this.inFlight.set(entry.callId, entry);
        });
      }
      if (Array.isArray(data.lastCallTimestamps)) {
        this.lastCallTimestamps = data.lastCallTimestamps;
      }
    } catch {}
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
