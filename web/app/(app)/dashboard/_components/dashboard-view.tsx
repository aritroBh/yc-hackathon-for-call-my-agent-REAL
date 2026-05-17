"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { useAtlas } from "@/lib/store";
import { DUR, EASE } from "@/lib/motion/presets";
import { Topbar } from "./topbar";
import { BestOfferBanner } from "./best-offer-banner";
import { KpiBlock } from "./kpi-block";
import { RegionBreakdown } from "./region-breakdown";
import { StatusDonut } from "./status-donut";
import { NowCallingStrip } from "./now-calling-strip";
import { LedgerTable } from "./ledger-table";

export function DashboardView() {
  const startCalling = useAtlas((s) => s.startCalling);

  // Lightweight auto-advance so the dashboard is alive on arrival.
  // The Phase-6 "magic moment" replaces this with an explicit trigger.
  useEffect(() => {
    startCalling();
  }, [startCalling]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar />
      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DUR.slow, ease: EASE.standard }}
        className="scroll-fade flex-1 space-y-4 overflow-y-auto px-8 py-6"
      >
        <BestOfferBanner />

        <div className="grid grid-cols-3 gap-4">
          <KpiBlock />
          <RegionBreakdown />
          <StatusDonut />
        </div>

        <NowCallingStrip />

        <LedgerTable />
      </motion.div>
    </div>
  );
}
