"use client";

import { useEffect, useRef } from "react";
import { startSimulator } from "@/lib/data/simulator";
import { startRealtimeBridge, triggerCall } from "@/lib/data/realtime";
import { useAtlas } from "@/lib/store";

export function StoreHydrator() {
  const callingStarted = useAtlas((s) => s.callingStarted);
  const callFired = useRef(false);

  // Always-on: SSE transcript listener from the bridge
  useEffect(() => {
    const stop = startRealtimeBridge();
    return stop;
  }, []);

  // Simulator drives the 5 animated supplier calls
  useEffect(() => {
    if (!callingStarted) return;
    const stop = startSimulator();
    return stop;
  }, [callingStarted]);

  // Fire the real Twilio call once when button clicked
  useEffect(() => {
    if (!callingStarted || callFired.current) return;
    callFired.current = true;
    triggerCall({ lang: "bn" });
  }, [callingStarted]);

  return null;
}
