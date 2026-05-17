import { SessionManager } from "@/lib/sessionManager";
import {
  detectTriggers,
  getTriggerSummary,
  type TriggerCategory,
  type DetectedTrigger,
} from "@/lib/triggerDetection";
import {
  ReasoningQueue,
  type ReasoningResult,
  type SupplierContext,
  type RfqContext,
} from "@/lib/reasoningQueue";

const ANTHROPIC_API_KEY = (() => {
  const k = process.env.ANTHROPIC_API_KEY || process.env.OPUS_API_KEY;
  if (!k) throw new Error("ANTHROPIC_API_KEY or OPUS_API_KEY required");
  return k;
})();

const COOLDOWN_MS = 30_000;
const DEBOUNCE_MS = 2_500;

let _taskCounter = 0;
function nextTaskId(): string {
  return `opus-${++_taskCounter}-${Date.now()}`;
}

export interface OpusInjectorOptions {
  sessionManager: SessionManager;
  reasoningQueue?: ReasoningQueue;
  enabledCategories?: TriggerCategory[];
  apiKey?: string;
  model?: string;
}

export interface IntelInjection {
  sessionId: string;
  taskId: string;
  triggerId: string;
  category: TriggerCategory;
  payload: string;
  confidence: number;
  injectedAt: number;
}

export interface InjectorSnapshot {
  pending: number;
  active: number;
  cooldowns: number;
  claimedEntries: number;
  activeSessions: number;
}

export class OpusInjector {
  private sessionManager: SessionManager;
  private queue: ReasoningQueue;
  private enabledCategories: Set<TriggerCategory>;
  private cooldowns = new Map<string, number>();
  private claimedHashes = new Map<string, Set<string>>();
  private semanticBuffers = new Map<string, string[]>();
  private taskToSession = new Map<string, string>();

  constructor(options: OpusInjectorOptions) {
    this.sessionManager = options.sessionManager;
    this.queue =
      options.reasoningQueue ||
      new ReasoningQueue({
        apiKey: options.apiKey || ANTHROPIC_API_KEY,
        model: options.model,
      });
    this.enabledCategories = new Set(
      (options.enabledCategories || [
        "steel_price",
        "regulation",
        "moq",
        "certification",
        "shipping",
        "geopolitical",
        "raw_material",
        "labor_cost",
        "tariff",
        "quality",
        "inventory",
        "energy_cost",
      ]) as TriggerCategory[],
    );

    this.queue.on("result", (result: ReasoningResult) => {
      this.onReasoningResult(result);
    });

    this.sessionManager.on(
      "transcript_delta",
      (sessionId: string, entry: { speaker: string; text: string }) => {
        if (entry.speaker !== "customer") return;
        this.onTranscript(sessionId, entry.text);
      },
    );
  }

  destroy(): void {
    this.queue.removeAllListeners();
    this.sessionManager.removeAllListeners("transcript_delta");
    this.cooldowns.clear();
    this.claimedHashes.clear();
    this.semanticBuffers.clear();
    this.taskToSession.clear();
  }

  snapshot(): InjectorSnapshot {
    return {
      pending: this.queue.pendingCount,
      active: this.queue.activeCount,
      cooldowns: this.cooldowns.size,
      claimedEntries: this.claimedHashes.size,
      activeSessions: this.sessionManager.getActiveCount(),
    };
  }

  private onTranscript(sessionId: string, text: string): void {
    const now = Date.now();

    const buffer = this.semanticBuffers.get(sessionId) || [];
    buffer.push(text);
    if (buffer.length > 50) buffer.shift();
    this.semanticBuffers.set(sessionId, buffer);

    const debounceKey = `${sessionId}-debounce`;
    const lastDebounce = this.cooldowns.get(debounceKey);
    if (lastDebounce && now - lastDebounce < DEBOUNCE_MS) return;
    this.cooldowns.set(debounceKey, now);

    const combined = buffer.slice(-10).join(" ");
    const existing = this.getClaimedHashes(sessionId);
    const triggers = detectTriggers(combined, Array.from(existing));

    for (const trigger of triggers) {
      if (!this.enabledCategories.has(trigger.category)) continue;
      if (this.isOnCooldown(sessionId, trigger.category)) continue;

      this.setCooldown(sessionId, trigger.category);
      this.addClaimedHash(sessionId, trigger.claim);

      this.dispatchReasoning(sessionId, trigger);
    }
  }

  private dispatchReasoning(
    sessionId: string,
    trigger: DetectedTrigger,
  ): void {
    const state = this.sessionManager.getSession(sessionId);
    if (!state) return;

    const taskId = nextTaskId();
    this.taskToSession.set(taskId, sessionId);

    const supplier: SupplierContext = {
      name: state.supplierName,
      region: (state as any).supplierRegion || "unknown",
    };
    const rfq: RfqContext = {
      id: state.rfqId,
      items: [],
      targetBudget: undefined,
    };

    this.queue.enqueue({
      id: taskId,
      sessionId,
      triggerId: `${trigger.category}-${trigger.timestamp}`,
      category: trigger.category,
      claim: trigger.claim,
      supplierContext: supplier,
      rfqContext: rfq,
      createdAt: Date.now(),
    });
  }

  private onReasoningResult(result: ReasoningResult): void {
    const sessionId = this.taskToSession.get(result.taskId);
    if (!sessionId) return;
    this.taskToSession.delete(result.taskId);
    this.injectIntel(sessionId, result.category as TriggerCategory, result);
  }

  private injectIntel(
    sessionId: string,
    category: TriggerCategory,
    result: ReasoningResult,
  ): IntelInjection | null {
    const state = this.sessionManager.getSession(sessionId);
    if (!state?.deepgramSession) return null;
    if (result.timedOut || result.confidence < 0.15) return null;

    const summary = getTriggerSummary(category);
    const payload = [
      "[LIVE INTEL]",
      "Context: " + summary,
      "Facts: " + (result.facts || "Supplier made a claim about " + category),
      "Rebuttal: " + result.rebuttal_context,
      "Position: " + result.suggested_position,
      "Confidence: " + (result.confidence * 100).toFixed(0) + "%",
      "[/LIVE INTEL]",
    ].join("\n");

    state.deepgramSession.sendText(payload);

    const injection: IntelInjection = {
      sessionId,
      taskId: result.taskId,
      triggerId: result.triggerId,
      category,
      payload,
      confidence: result.confidence,
      injectedAt: Date.now(),
    };

    return injection;
  }

  private isOnCooldown(sessionId: string, category: string): boolean {
    const key = sessionId + ":" + category;
    const until = this.cooldowns.get(key);
    if (!until) return false;
    return Date.now() < until;
  }

  private setCooldown(sessionId: string, category: string): void {
    const key = sessionId + ":" + category;
    this.cooldowns.set(key, Date.now() + COOLDOWN_MS);
  }

  private getClaimedHashes(sessionId: string): Set<string> {
    if (!this.claimedHashes.has(sessionId)) {
      this.claimedHashes.set(sessionId, new Set());
    }
    return this.claimedHashes.get(sessionId)!;
  }

  private addClaimedHash(sessionId: string, claim: string): void {
    const set = this.getClaimedHashes(sessionId);
    if (set.size > 200) set.clear();
    set.add(claim.toLowerCase().slice(0, 80));
  }

  get queueStatus(): { pending: number; active: number } {
    return {
      pending: this.queue.pendingCount,
      active: this.queue.activeCount,
    };
  }
}

export function createOpusInjector(
  options: OpusInjectorOptions,
): OpusInjector {
  return new OpusInjector(options);
}
