"use client";

import { useEffect } from "react";
import { startRealtimeBridge as startSimulator } from "@/lib/data/realtime";

/**
 * Boots the mock realtime engine once on mount. This is the ONLY place
 * the data source is wired — swap `startSimulator` for a real backend
 * bridge here and the entire UI keeps working unchanged.
 */
export function StoreHydrator() {
  useEffect(() => {
    const stop = startSimulator();
    return stop;
  }, []);

  return null;
}
