export interface TranscriptEntry {
  role: "agent" | "supplier" | "system";
  content: string;
  timestamp: string;
}

export interface TranscriptBufferOptions {
  maxSize?: number;
  flushThreshold?: number;
  flushIntervalMs?: number;
  dedupWindowMs?: number;
}

const DEFAULT_OPTS: Required<TranscriptBufferOptions> = {
  maxSize: 1000,
  flushThreshold: 50,
  flushIntervalMs: 5_000,
  dedupWindowMs: 2_000,
};

export class TranscriptBuffer {
  private buffer: TranscriptEntry[] = [];
  private opts: Required<TranscriptBufferOptions>;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private onFlush: ((entries: TranscriptEntry[]) => Promise<void>) | null = null;
  private lastEntry: { role: string; content: string; time: number } | null = null;

  constructor(opts?: TranscriptBufferOptions) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  setFlushHandler(handler: (entries: TranscriptEntry[]) => Promise<void>): void {
    this.onFlush = handler;
  }

  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), this.opts.flushIntervalMs);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  push(entry: TranscriptEntry): void {
    if (this.isDuplicate(entry)) return;
    this.buffer.push(entry);
    this.lastEntry = { role: entry.role, content: entry.content, time: Date.now() };

    if (this.buffer.length >= this.opts.flushThreshold) {
      this.flush();
    }
  }

  pushMany(entries: TranscriptEntry[]): void {
    for (const e of entries) this.push(e);
  }

  get length(): number {
    return this.buffer.length;
  }

  getAll(): TranscriptEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  async flush(): Promise<TranscriptEntry[]> {
    if (this.buffer.length === 0) return [];
    const batch = this.buffer.splice(0, this.opts.flushThreshold);
    if (this.onFlush) {
      try {
        await this.onFlush(batch);
      } catch {}
    }
    return batch;
  }

  async flushAll(): Promise<TranscriptEntry[]> {
    if (this.buffer.length === 0) return [];
    const batch = [...this.buffer];
    this.buffer = [];
    if (this.onFlush) {
      try {
        await this.onFlush(batch);
      } catch {}
    }
    return batch;
  }

  private isDuplicate(entry: TranscriptEntry): boolean {
    if (!this.lastEntry) return false;
    if (entry.role !== this.lastEntry.role) return false;
    if (Date.now() - this.lastEntry.time > this.opts.dedupWindowMs) return false;
    const a = entry.content.toLowerCase().trim();
    const b = this.lastEntry.content.toLowerCase().trim();
    if (a === b) return true;
    if (a.length > 10 && b.length > 10) {
      if (a.startsWith(b) || b.startsWith(a)) return true;
    }
    return false;
  }

  slice(count: number): TranscriptEntry[] {
    return this.buffer.slice(-count);
  }

  getRecentText(count: number = 5): string {
    return this.buffer.slice(-count).map((e) => `[${e.role}] ${e.content}`).join("\n");
  }
}
