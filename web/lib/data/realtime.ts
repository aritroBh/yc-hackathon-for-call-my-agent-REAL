import { useAtlas } from "@/lib/store";

const BRIDGE_URL =
  process.env.NEXT_PUBLIC_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:3001";

// Match the seed IDs so real transcript feeds into the Kolkata row
const LIVE_CALL_ID = "call_sup_kolkata";
const LIVE_RFQ_ID = "rfq_sandals_global";
const LIVE_SUPPLIER_ID = "sup_kolkata";

// Called by store-hydrator when the "Start calling" button is clicked.
// Fires the real Twilio outbound call via the bridge.
export async function triggerCall(opts?: { to?: string; lang?: string }) {
  const ingest = useAtlas.getState().ingestEvent;
  const base = { call_id: LIVE_CALL_ID, rfq_id: LIVE_RFQ_ID, supplier_id: LIVE_SUPPLIER_ID };

  ingest({ ...base, type: "call_initiated", timestamp: new Date().toISOString(), data: {} });

  try {
    const res = await fetch(`${BRIDGE_URL}/call/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: opts?.to, lang: opts?.lang || "bn" }),
    });
    const data = await res.json();
    console.log("[realtime] call started:", data);
    ingest({ ...base, type: "call_connected", timestamp: new Date().toISOString(), data: {} });
  } catch (err) {
    console.error("[realtime] call/start failed:", err);
    ingest({ ...base, type: "call_failed", timestamp: new Date().toISOString(), data: { error: String(err) } });
  }
}

// Always-on SSE listener — connects to bridge transcript stream.
// Returns cleanup. No auto call firing — call is triggered by triggerCall().
export function startRealtimeBridge(): () => void {
  const ingest = useAtlas.getState().ingestEvent;
  const base = { call_id: LIVE_CALL_ID, rfq_id: LIVE_RFQ_ID, supplier_id: LIVE_SUPPLIER_ID };

  const es = new EventSource(`${BRIDGE_URL}/transcript-events`);

  es.onmessage = (e) => {
    try {
      const frame = JSON.parse(e.data) as {
        ts: number;
        role: "agent" | "supplier";
        original: string;
        english: string;
      };
      ingest({
        ...base,
        type: "transcript_delta",
        timestamp: new Date(frame.ts).toISOString(),
        data: {
          role: frame.role,
          content: frame.english || frame.original,
          original: frame.original,
        },
      });
    } catch {
      // ignore malformed frames
    }
  };

  es.onerror = () => {
    console.warn("[realtime] SSE connection lost, will auto-retry");
  };

  const ticker = setInterval(() => useAtlas.getState().tick(1), 1000);

  return () => {
    es.close();
    clearInterval(ticker);
  };
}
