import { useAtlas } from "@/lib/store";
import { seedCallOrder, seedCalls, seedSuppliers, seedRfq } from "./seed";
import { scriptForCall } from "./transcript-script";

/**
 * setInterval-driven mock realtime engine. Emits LiveCallEvent-shaped
 * updates into the store's single `ingestEvent` reducer.
 *
 * Swap point: to go live, replace the `startSimulator` import in
 * `store-hydrator.tsx` with a real `startRealtimeBridge` that forwards
 * normalized Vapi/WebSocket messages into the same `ingestEvent`.
 * Nothing else changes.
 */

const TICK_MS = 300;
const CALL_STAGGER_MS = 1600;

let running = false; // StrictMode double-mount guard

interface ScheduledEvent {
  atMs: number;
  build: (ts: string) => ReturnType<typeof Object> | unknown;
}

function buildSchedule(): { atMs: number; build: (ts: string) => unknown }[] {
  const units = seedRfq.items[0]?.quantity ?? 0;
  const schedule: { atMs: number; build: (ts: string) => unknown }[] = [];

  seedCallOrder.forEach((callId, index) => {
    if (callId === "call_sup_kolkata") return; // real call handles this row
    const call = seedCalls[callId];
    const supplier = seedSuppliers[call.supplier_id];
    const meta = supplier.metadata as Record<string, string>;
    const language = (meta.language as "Yoruba" | "Hindi" | "Bengali") ?? "Yoruba";
    const start = index * CALL_STAGGER_MS;

    for (const beat of scriptForCall(
      callId,
      call.supplier_id,
      language,
      supplier.name,
      units,
    )) {
      schedule.push({ atMs: start + beat.offsetMs, build: beat.build });
    }
  });

  return schedule.sort((a, b) => a.atMs - b.atMs);
}

export function startSimulator(): () => void {
  if (running) return () => {};
  running = true;

  const schedule = buildSchedule();
  let cursor = 0;
  let campaignMs = 0;

  const interval = setInterval(() => {
    const store = useAtlas.getState();

    if (!store.callingStarted || store.isPausedAll) return;

    campaignMs += TICK_MS;
    store.tick(TICK_MS / 1000);

    while (cursor < schedule.length && schedule[cursor].atMs <= campaignMs) {
      const ts = new Date().toISOString();
      const partial = schedule[cursor].build(ts) as {
        type: string;
        call_id: string;
        rfq_id: string;
        supplier_id: string;
        data: Record<string, unknown>;
      };
      store.ingestEvent({ ...partial, timestamp: ts } as never);
      cursor += 1;
    }

    if (cursor >= schedule.length) {
      clearInterval(interval);
      running = false;
    }
  }, TICK_MS);

  return () => {
    clearInterval(interval);
    running = false;
  };
}
