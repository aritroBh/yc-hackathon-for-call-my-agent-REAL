import EventEmitter from "events";

export interface ReasoningTask {
  id: string;
  sessionId: string;
  triggerId: string;
  category: string;
  claim: string;
  supplierContext: SupplierContext;
  rfqContext: RfqContext;
  createdAt: number;
}

export interface SupplierContext {
  name: string;
  industry?: string;
  region?: string;
  historicalPrices?: { date: string; price: number; item: string }[];
}

export interface RfqContext {
  id: string;
  items: { sku: string; description: string; quantity: number; unit: string }[];
  targetBudget?: number;
}

export interface ReasoningResult {
  taskId: string;
  triggerId: string;
  category: string;
  rebuttal_context: string;
  facts: string;
  suggested_position: string;
  confidence: number;
  reasoningTimeMs: number;
  completedAt: number;
  timedOut: boolean;
}

export interface ReasoningQueueOptions {
  apiKey: string;
  model?: string;
  maxConcurrency?: number;
  timeoutMs?: number;
  baseUrl?: string;
}

const OPUS_PROMPT_TEMPLATE = `You are a procurement intelligence analyst. A supplier has made a factual claim during a price negotiation. Your job is to analyze the claim and provide a structured assessment.

SUPPLIER CLAIM: {{claim}}
CATEGORY: {{category}}
SUPPLIER: {{supplierName}} ({{supplierRegion}})
RFQ ITEMS: {{rfqItems}}

Analyze this claim and return a JSON object with exactly these fields:
{
  "rebuttal_context": "Brief, actionable intelligence the negotiator can use to counter or qualify this claim. 2-3 sentences max.",
  "facts": "Factual context about this claim — known market data, typical ranges, or common counterpoints. Keep it specific and verifiable.",
  "suggested_position": "Recommended negotiating position or counter-strategy based on this intelligence.",
  "confidence": "0.0-1.0 score reflecting how confident you are in this assessment. Lower if you lack specific data."
}

Return ONLY valid JSON. No markdown fences. No explanation.`;

export class ReasoningQueue extends EventEmitter {
  private queue: ReasoningTask[] = [];
  private inFlight = 0;
  private options: Required<ReasoningQueueOptions>;

  constructor(options: ReasoningQueueOptions) {
    super();
    this.options = {
      apiKey: options.apiKey,
      model: options.model || "claude-opus-4-5-20250514",
      maxConcurrency: options.maxConcurrency || 3,
      timeoutMs: options.timeoutMs || 4000,
      baseUrl: options.baseUrl || "https://api.anthropic.com/v1",
    };
  }

  enqueue(task: ReasoningTask): void {
    this.queue.push(task);
    this.processNext();
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get activeCount(): number {
    return this.inFlight;
  }

  clear(): void {
    this.queue = [];
    this.emit("cleared");
  }

  private processNext(): void {
    while (this.inFlight < this.options.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.inFlight++;
      this.dispatch(task);
    }
  }

  private async dispatch(task: ReasoningTask): Promise<ReasoningResult | void> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const prompt = OPUS_PROMPT_TEMPLATE
        .replace("{{claim}}", task.claim)
        .replace("{{category}}", task.category)
        .replace("{{supplierName}}", task.supplierContext.name)
        .replace("{{supplierRegion}}", task.supplierContext.region || "unknown")
        .replace("{{rfqItems}}", this.formatRfqItems(task.rfqContext));

      const result = await this.callAnthropic(prompt, controller.signal);

      clearTimeout(timeoutId);
      const reasoningTimeMs = Date.now() - startTime;

      const parsed = this.parseResult(result, task, reasoningTimeMs);
      this.emit("result", parsed);
      return parsed;
    } catch (err: any) {
      clearTimeout(timeoutId);
      const reasoningTimeMs = Date.now() - startTime;
      const timedOut = err.name === "AbortError" || reasoningTimeMs >= this.options.timeoutMs;

      if (timedOut) {
        const result: ReasoningResult = {
          taskId: task.id,
          triggerId: task.triggerId,
          category: task.category,
          rebuttal_context: "[Timed out]",
          facts: "",
          suggested_position: "Use general negotiation best practices — intelligence unavailable.",
          confidence: 0.0,
          reasoningTimeMs,
          completedAt: Date.now(),
          timedOut: true,
        };
        this.emit("timeout", result);
        this.emit("result", result);
        return result;
      }

      this.emit("error", { taskId: task.id, error: err.message });
    } finally {
      this.inFlight--;
      this.processNext();
      if (this.inFlight === 0 && this.queue.length === 0) {
        this.emit("drained");
      }
    }
  }

  private async callAnthropic(
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    const response = await fetch(`${this.options.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.options.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Anthropic API ${response.status}: ${body}`);
    }

    const json = await response.json();
    const content = json.content?.[0]?.text;
    if (!content) throw new Error("Empty Anthropic response");
    return content;
  }

  private parseResult(
    raw: string,
    task: ReasoningTask,
    reasoningTimeMs: number,
  ): ReasoningResult {
    try {
      const json = JSON.parse(raw.trim());
      return {
        taskId: task.id,
        triggerId: task.triggerId,
        category: task.category,
        rebuttal_context: json.rebuttal_context || "",
        facts: json.facts || "",
        suggested_position: json.suggested_position || "",
        confidence: typeof json.confidence === "number" ? json.confidence : 0.5,
        reasoningTimeMs,
        completedAt: Date.now(),
        timedOut: false,
      };
    } catch {
      return {
        taskId: task.id,
        triggerId: task.triggerId,
        category: task.category,
        rebuttal_context: raw.slice(0, 300),
        facts: "",
        suggested_position: "Use general negotiation best practices.",
        confidence: 0.2,
        reasoningTimeMs,
        completedAt: Date.now(),
        timedOut: false,
      };
    }
  }

  private formatRfqItems(ctx: RfqContext): string {
    if (!ctx.items || ctx.items.length === 0) return "Not specified";
    return ctx.items
      .map((i) => `${i.quantity} ${i.unit} of "${i.description}"`)
      .join("; ");
  }
}
