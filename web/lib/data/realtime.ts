import { useAtlas } from "@/lib/store";

const BRIDGE_URL =
  process.env.NEXT_PUBLIC_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:3001";

// Synthetic call/supplier IDs for the live session (no DB yet)
const LIVE_CALL_ID = "live-call";
const LIVE_RFQ_ID = "live-rfq";
const LIVE_SUPPLIER_ID = "live-supplier";

export function startRealtimeBridge(): () => void {
  const ingest = useAtlas.getState().ingestEvent;

  const base = {
    call_id: LIVE_CALL_ID,
    rfq_id: LIVE_RFQ_ID,
    supplier_id: LIVE_SUPPLIER_ID,
  };

  // Fire call_initiated so the dashboard shows a live row
  ingest({ ...base, type: "call_initiated", timestamp: new Date().toISOString(), data: {} });
  ingest({ ...base, type: "call_connected", timestamp: new Date().toISOString(), data: {} });

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

  const ticker = setInterval(
    () => useAtlas.getState().tick(1),
    1000,
  );

  return () => {
    es.close();
    clearInterval(ticker);
  };
}
