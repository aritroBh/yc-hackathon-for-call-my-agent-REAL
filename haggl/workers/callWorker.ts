import "dotenv/config";
import { getCallQueue } from "@/lib/queue";
import { getDispatcher } from "@/lib/dispatcher";
import { createVapiAssistant, createVapiCall, getVapiCall } from "@/lib/vapi";
import { tables, getSupplierById, getRFQById } from "@/lib/db";
import { getDialectByLocale } from "@/lib/prompts/dialectPrompts";
import { buildNegotiationPrompt } from "@/lib/promptBuilder";
import { getSocketServer } from "@/lib/socket";
import type { QueueEntry } from "@/lib/queue";
import type { CallRow } from "@/types/database";

interface CallWorkerOptions {
  pollIntervalMs?: number;
  callTimeoutSeconds?: number;
  retryBackoffMs?: number;
}

const DEFAULT_OPTIONS: CallWorkerOptions = {
  pollIntervalMs: 500,
  callTimeoutSeconds: 480,
  retryBackoffMs: 30_000,
};

function getLocaleForLanguage(lang: string | unknown): string {
  if (typeof lang !== "string") return "en-US";
  const clean = lang.toLowerCase().trim();
  if (clean === "twi" || clean === "akan" || clean === "tw-gh") return "tw-GH";
  if (clean === "yoruba" || clean === "yo-ng") return "yo-NG";
  if (clean === "hindi" || clean === "hi" || clean === "hi-in") return "hi-IN";
  if (clean === "tamil" || clean === "si-in") return "si-IN";
  return "en-US";
}

export class CallWorker {
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activeCalls = new Map<string, AbortController>();
  private opts: Required<CallWorkerOptions>;

  constructor(opts?: CallWorkerOptions) {
    this.opts = {
      pollIntervalMs: opts?.pollIntervalMs ?? DEFAULT_OPTIONS.pollIntervalMs!,
      callTimeoutSeconds:
        opts?.callTimeoutSeconds ?? DEFAULT_OPTIONS.callTimeoutSeconds!,
      retryBackoffMs: opts?.retryBackoffMs ?? DEFAULT_OPTIONS.retryBackoffMs!,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.pollTimer = setInterval(() => this.poll(), this.opts.pollIntervalMs);

    const queue = getCallQueue();
    queue.on("retrying" as any, (entry: QueueEntry, attempt: number) => {
      const delay = this.opts.retryBackoffMs * attempt;
      setTimeout(() => {
        if (entry.attempt < entry.maxAttempts) {
          queue.enqueue(entry);
        }
      }, delay);
    });
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.activeCalls.forEach((controller) => {
      controller.abort();
    });
    this.activeCalls.clear();
  }

  get isRunning(): boolean {
    return this.running;
  }

  get activeCallCount(): number {
    return this.activeCalls.size;
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    const queue = getCallQueue();

    const entry = await queue.dequeue();
    if (!entry) return;

    const controller = new AbortController();
    this.activeCalls.set(entry.callId, controller);

    this.processEntry(entry).finally(() => {
      this.activeCalls.delete(entry.callId);
    });
  }

  private async processEntry(entry: QueueEntry): Promise<void> {
    const queue = getCallQueue();
    const dispatcher = getDispatcher();

    try {
      queue.recordCallStart();
      await tables.calls
        .update({
          status: "queued",
          twilio_call_sid: null,
          started_at: new Date().toISOString(),
        })
        .eq("id", entry.callId);

      getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "queued", twilioCallSid: null });

      // 1. Retrieve supplier and RFQ context
      const supplier = await getSupplierById(entry.supplierId);
      const rfq = await getRFQById(entry.rfqId);

      if (!supplier || !rfq) {
        throw new Error("Supplier or RFQ context not found in DB");
      }

      // 2. Resolve language and dialect context
      const language = ((supplier.metadata as any)?.language as string) || "english";
      const dialectContext = getDialectByLocale(getLocaleForLanguage(language));

      // 3. Build initial negotiation agent prompt
      const builderOutput = buildNegotiationPrompt({
        rfq: {
          title: rfq.title,
          description: rfq.description,
          items: rfq.items,
          target_price: rfq.target_price,
          floor_price: rfq.floor_price,
          currency: rfq.currency || "USD",
          deadline: rfq.deadline,
        },
        supplier: {
          name: supplier.name,
          contact_name: supplier.contact_name,
          phone: supplier.phone,
          email: supplier.email,
          metadata: supplier.metadata || {},
        },
        dialectConfig: dialectContext ? {
          name: dialectContext.name,
          locale: dialectContext.locale,
          prompt_template: "",
          speaking_style: dialectContext.communicationStyle,
          cultural_notes: dialectContext.culturalNotes || "",
          formality_level: dialectContext.formalityLevel,
          greeting_phrase: dialectContext.greetingPhrase,
          closing_phrase: dialectContext.closingPhrase,
        } : null,
        aggressiveness: "medium",
        priority: "balanced",
        aiDisclosure: true,
      });

      let systemPrompt = builderOutput.systemPrompt;
      const NATIVE_LANG_MAP: Record<string, string> = {
        "tw-GH": "Twi / Akan",
        "yo-NG": "Yoruba",
        "hi-IN": "Hindi",
        "si-IN": "Tamil / South Indian English",
      };
      const nativeLangName = dialectContext?.locale ? NATIVE_LANG_MAP[dialectContext.locale] : null;
      if (nativeLangName) {
        const extraHint = dialectContext?.locale === "hi-IN"
          ? "Use 'ji' honorific always (e.g. 'Rajesh ji'). Use 'aap' not 'tum'. Phrase refusals as 'yeh thoda mushkil hai'."
          : dialectContext?.locale === "tw-GH"
          ? "Use 'Owura' for Sir and 'Awuraa' for Madam. Ask about wellbeing before business. Use proverbs."
          : "";
        systemPrompt = `LANGUAGE INSTRUCTION: You MUST speak exclusively in ${nativeLangName} throughout this call.
Do not translate to English. Do not code-switch unless the supplier does first.
Use natural, fluent ${nativeLangName} — idioms, proverbs, culturally appropriate phrases.
${extraHint}
Your goal is to make the supplier feel they are speaking with someone who genuinely knows their culture.
` + systemPrompt;
      }

      const beginMessage = dialectContext?.greetingPhrase || "Hello, I am calling from HAGGL to negotiate the procurement quote.";

      // 4. Provision a Vapi assistant (custom Khaya STT/TTS + haggl LLM) per call
      const { assistantId } = await createVapiAssistant({
        name: `HAGGL Agent - ${supplier.name}`,
        systemPrompt,
        language,
        beginMessage,
        hagglCallId: entry.callId,
      });

      // 5. Initiate the Vapi outbound call
      const { vapiCallId } = await createVapiCall({
        assistantId,
        toPhone: entry.phone,
        callId: entry.callId,
      });

      // NOTE: twilio_call_sid now holds the generic remote-provider call id
      // (the Vapi call id) — no schema change. Do not wire real Twilio polling
      // against this column.
      queue.markCalling(entry.callId, vapiCallId);

      await tables.calls
        .update({
          status: "ringing",
          twilio_call_sid: vapiCallId,
        })
        .eq("id", entry.callId);

      getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "ringing", twilioCallSid: vapiCallId });

      const callTimeoutMs = this.opts.callTimeoutSeconds * 1000;
      const timeout = setTimeout(async () => {
        const entry2 = queue.getByCallId(entry.callId);
        if (entry2 && (entry2.status === "calling" || entry2.status === "queued")) {
          await tables.calls
            .update({
              status: "no_answer",
              error_message: "Call timed out",
              ended_at: new Date().toISOString(),
            })
            .eq("id", entry.callId);

          getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "no_answer", twilioCallSid: vapiCallId });

          queue.fail(entry.callId, "No answer - timed out");
          dispatcher.incrementFailed(entry.rfqId);
        }
      }, callTimeoutMs);

      const checkInterval = setInterval(async () => {
        try {
          const { data: call } = await tables.calls
            .select("status, twilio_call_sid")
            .eq("id", entry.callId)
            .single();

          if (!call) return;

          const c = call as Pick<CallRow, "status" | "twilio_call_sid">;

          if (c.status === "completed" || c.status === "failed" || c.status === "no_answer") {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            return;
          }

          if (c.twilio_call_sid) {
            const remoteCall = await getVapiCall(c.twilio_call_sid);

            if (remoteCall.status === "completed") {
              clearTimeout(timeout);
              clearInterval(checkInterval);

              queue.complete(entry.callId);
              dispatcher.incrementCompleted(entry.rfqId);

              await tables.calls
                .update({ 
                  ended_at: new Date().toISOString(),
                  duration_seconds: remoteCall.duration || 60
                })
                .eq("id", entry.callId);

              getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "completed", twilioCallSid: c.twilio_call_sid });
            } else if (["failed", "busy", "no_answer", "rejected"].includes(remoteCall.status)) {
              clearTimeout(timeout);
              clearInterval(checkInterval);

              queue.fail(entry.callId, `Supplier ${remoteCall.status}`);
              dispatcher.incrementFailed(entry.rfqId);

              await tables.calls
                .update({
                  ended_at: new Date().toISOString(),
                  status: remoteCall.status === "no_answer" ? "no_answer" : "failed",
                  error_message: `Call ended with status: ${remoteCall.status}`
                })
                .eq("id", entry.callId);

              getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: remoteCall.status === "no_answer" ? "no_answer" : "failed", twilioCallSid: c.twilio_call_sid });
            } else if (remoteCall.status === "in_progress" && c.status !== "in_progress") {
              queue.updateStatus(entry.callId, "in_progress");
              await tables.calls.update({ status: "in_progress" }).eq("id", entry.callId);
              getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "in_progress", twilioCallSid: c.twilio_call_sid });
            }
          }
        } catch {}
      }, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await tables.calls
        .update({
          status: "failed",
          error_message: msg,
          ended_at: new Date().toISOString(),
        })
        .eq("id", entry.callId);

      getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "failed", twilioCallSid: null });

      queue.fail(entry.callId, msg);
      dispatcher.incrementFailed(entry.rfqId);
    }
  }
}

let _globalWorker: CallWorker | null = null;

export function getCallWorker(opts?: CallWorkerOptions): CallWorker {
  if (!_globalWorker) {
    _globalWorker = new CallWorker(opts);
  }
  return _globalWorker;
}

