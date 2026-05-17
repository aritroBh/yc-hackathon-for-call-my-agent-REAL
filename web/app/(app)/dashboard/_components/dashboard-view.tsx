"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PhoneCall, Radio } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { playDealCue } from "@/lib/sound";
import { DUR, EASE } from "@/lib/motion/presets";
import { Topbar } from "./topbar";
import { BestOfferBanner } from "./best-offer-banner";
import { KpiBlock } from "./kpi-block";
import { RegionBreakdown } from "./region-breakdown";
import { StatusDonut } from "./status-donut";
import { NowCallingStrip } from "./now-calling-strip";
import { LedgerTable } from "./ledger-table";

function ReadyState() {
  const title = useAtlas((s) => s.rfq?.title ?? "this negotiation");
  const beginCampaign = useAtlas((s) => s.beginCampaign);

  return (
    <motion.div
      key="ready"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: DUR.slow, ease: EASE.standard }}
      className="flex flex-1 flex-col items-center justify-center px-8"
    >
      <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-surface px-10 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-clay-tint">
          <Radio className="size-6 text-clay" />
        </span>
        <h2 className="mt-5 font-display text-2xl font-semibold text-ink">
          Ready when you are
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          6 suppliers across Nigeria &amp; Ghana are queued for{" "}
          <span className="text-ink">{title}</span>. Your agent will call each
          in their language and hold your price cap.
        </p>
        <button
          type="button"
          onClick={() => {
            playDealCue();
            beginCampaign();
          }}
          className="mt-7 flex items-center gap-2 rounded-md bg-clay px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-clay-deep"
        >
          <PhoneCall className="size-4" />
          Start calling 6 suppliers
        </button>
      </div>
    </motion.div>
  );
}

function LiveDashboard() {
  const magic = useAtlas((s) => s.magicMomentActive);
  const clearMagic = useAtlas((s) => s.clearMagicMoment);

  useEffect(() => {
    if (!magic) return;
    const t = setTimeout(() => clearMagic(), 1400);
    return () => clearTimeout(t);
  }, [magic, clearMagic]);

  return (
    <motion.div
      key="live"
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DUR.xslow, ease: EASE.standard }}
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
  );
}

export function DashboardView() {
  const callingStarted = useAtlas((s) => s.callingStarted);
  // Avoid an SSR/client flash: decide layout only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar />
      <AnimatePresence mode="wait" initial={false}>
        {!mounted ? (
          <div key="boot" className="flex-1" />
        ) : callingStarted ? (
          <LiveDashboard />
        ) : (
          <ReadyState />
        )}
      </AnimatePresence>
    </div>
  );
}
