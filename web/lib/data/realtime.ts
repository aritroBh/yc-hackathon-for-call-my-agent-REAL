/**
 * REAL BACKEND SWAP TARGET (not wired yet).
 *
 * This is the production replacement for `startSimulator`. It has the
 * EXACT same signature: `() => cleanup`. To go live, change one import
 * in `lib/store/store-hydrator.tsx`:
 *
 *   - import { startSimulator } from "@/lib/data/simulator";
 *   + import { startRealtimeBridge as startSimulator } from "@/lib/data/realtime";
 *
 * Nothing else changes: the store, selectors, and every component keep
 * working because both feed the same `useAtlas.getState().ingestEvent`
 * with `LiveCallEvent`-shaped messages.
 */

import { useAtlas } from "@/lib/store";
import type { LiveCallEvent } from "@/lib/types";

export function startRealtimeBridge(): () => void {
  // Example shape of the real wiring (Vapi / Supabase Realtime / WS):
  //
  //   const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL!);
  //   ws.onmessage = (raw) => {
  //     const event = normalize(JSON.parse(raw.data)); // → LiveCallEvent
  //     useAtlas.getState().ingestEvent(event);
  //   };
  //   const timer = setInterval(() => useAtlas.getState().tick(1), 1000);
  //   return () => { ws.close(); clearInterval(timer); };

  void useAtlas; // referenced so the seam is obvious to readers
  const _ingest = (e: LiveCallEvent) => useAtlas.getState().ingestEvent(e);
  void _ingest;

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[realtime] startRealtimeBridge is a stub - wire Vapi/WebSocket before using.",
    );
  }
  return () => {};
}
