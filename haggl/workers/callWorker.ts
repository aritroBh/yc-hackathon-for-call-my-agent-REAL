import "dotenv/config";
import { getCallQueue } from "@/lib/queue";
import { getDispatcher } from "@/lib/dispatcher";
import { createOutboundCall } from "@/lib/twilio";
import { tables } from "@/lib/db";
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

      const result = await createOutboundCall(entry.phone, entry.callId, {
        record: true,
        timeoutSeconds: this.opts.callTimeoutSeconds,
      });

      if (!result.success || !result.callSid) {
        const errorMsg = result.error || "Twilio call creation failed";
        await tables.calls
          .update({
            status: "failed",
            error_message: errorMsg,
            ended_at: new Date().toISOString(),
          })
          .eq("id", entry.callId);

        getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "failed", twilioCallSid: null });

        queue.fail(entry.callId, errorMsg);
        dispatcher.incrementFailed(entry.rfqId);
        return;
      }

      queue.markCalling(entry.callId, result.callSid);

      await tables.calls
        .update({
          status: "ringing",
          twilio_call_sid: result.callSid,
        })
        .eq("id", entry.callId);

      getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "ringing", twilioCallSid: result.callSid });

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

          getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "no_answer", twilioCallSid: result.callSid });

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

          if (c.status === "in_progress" || c.status === "completed") {
            clearTimeout(timeout);
            clearInterval(checkInterval);

            if (c.status === "in_progress") {
              queue.updateStatus(entry.callId, "in_progress");
              getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "in_progress", twilioCallSid: c.twilio_call_sid });
            } else {
              queue.complete(entry.callId);
              dispatcher.incrementCompleted(entry.rfqId);

              // Calculate costs
              let total_cost_millicents = 0;
              let duration_seconds = 0;
              try {
                if (c.twilio_call_sid) {
                  const accountSid = process.env.TWILIO_ACCOUNT_SID;
                  const authToken = process.env.TWILIO_AUTH_TOKEN;
                  if (accountSid && authToken) {
                    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
                    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${c.twilio_call_sid}.json`, {
                      headers: { 'Authorization': `Basic ${auth}` }
                    });
                    if (twilioRes.ok) {
                      const twilioCall = await twilioRes.json();
                      const price = twilioCall.price ? parseFloat(twilioCall.price) : 0;
                      const twilio_millicents = Math.round(Math.abs(price) * 100_000);
                      duration_seconds = twilioCall.duration ? parseInt(twilioCall.duration) : 0;
                      
                      // Claude API cost estimate
                      const { count: injections } = await tables.reasoning_traces
                        .select('*', { count: 'exact', head: true })
                        .eq('input_data->>call_id', entry.callId);
                      
                      const claude_millicents = Math.round(((injections || 0) * 700 * 15) / 1_000_000 * 100_000) + 50; // +50 for Haiku extraction
                      
                      total_cost_millicents = twilio_millicents + claude_millicents;
                    }
                  }
                }
              } catch (costErr) {
                console.error("[CallWorker] Failed to calculate costs:", costErr);
              }

              await tables.calls
                .update({ 
                  ended_at: new Date().toISOString(),
                  ...(total_cost_millicents > 0 && { cost_millicents: total_cost_millicents }),
                  ...(duration_seconds > 0 && { duration_seconds })
                })
                .eq("id", entry.callId);

              getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: "completed", twilioCallSid: c.twilio_call_sid });
            }
          } else if (
            ["failed", "busy", "no_answer", "rejected", "capped"].includes(
              c.status,
            )
          ) {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            queue.fail(entry.callId, `Supplier ${c.status}`);
            dispatcher.incrementFailed(entry.rfqId);
            getSocketServer()?.emit('call_status_changed', { callId: entry.callId, rfqId: entry.rfqId, status: c.status, twilioCallSid: c.twilio_call_sid });
          }
        } catch {}
      }, 2_000);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
