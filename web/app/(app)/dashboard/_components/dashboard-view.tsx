"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  PhoneCall,
  Radio,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
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

/**
 * Pre-campaign screen, now research-aware. Reflects the Phase-2
 * lifecycle the (app)-level <ResearchRunner> drives:
 *   running → deep research in progress (+ demo-skip escape hatch)
 *   done    → per-company dossiers to review, then start calling
 *   error   → fall back to the drafted plan / demo template
 *   idle    → direct hit / pure demo: the ready-to-call template
 */
function ReadyState() {
  const plan = useAtlas((s) => s.plan);
  const status = useAtlas((s) => s.researchStatus);
  const message = useAtlas((s) => s.researchMessage);
  const companies = useAtlas((s) => s.researchedCompanies);
  const beginCampaign = useAtlas((s) => s.beginCampaign);
  const title = useAtlas((s) => s.rfq?.title ?? "this negotiation");

  const supplierCount = plan?.suppliers.length ?? 6;
  const regionsText = plan
    ? plan.regions.length === 1
      ? plan.regions[0]
      : plan.regions.join(" & ")
    : "Nigeria & Ghana";

  // The "demo template" path: beginCampaign() starts the seeded,
  // ready-to-call campaign immediately (Q3 — button on the dashboard).
  const startCalling = () => {
    playDealCue();
    beginCampaign();
  };

  const wide = status === "done" && companies.length > 0;

  return (
    <motion.div
      key="ready"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: DUR.slow, ease: EASE.standard }}
      className="flex flex-1 flex-col items-center justify-center px-8"
    >
      <div
        className={
          "flex w-full flex-col items-center rounded-xl border border-border bg-surface px-10 py-12 text-center " +
          (wide ? "max-w-xl" : "max-w-md")
        }
      >
        {status === "running" && (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-clay-tint">
              <Loader2 className="size-6 animate-spin text-clay" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold text-ink">
              Researching your suppliers
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              Gemini Deep Research is building a negotiation dossier for each
              company across <span className="text-ink">{regionsText}</span>.
              It runs in the background — you can keep working; it’ll land here
              when ready.
            </p>
            <div
              aria-live="polite"
              className="mt-5 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3.5 py-2 font-mono text-[12px] text-ink-2"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-clay" />
              {message ?? "Working…"}
            </div>
            <button
              type="button"
              onClick={startCalling}
              className="mt-7 flex items-center gap-2 rounded-md border border-border bg-surface px-5 py-3 text-sm font-semibold text-ink-2 transition-colors hover:border-clay hover:text-clay-deep"
            >
              <PhoneCall className="size-4" />
              Start demo campaign now
            </button>
            <p className="mt-2 font-mono text-[11px] text-ink-3">
              Skips the wait with a ready-to-call template plan.
            </p>
          </>
        )}

        {status === "done" && (
          <>
            <span
              className="flex size-14 items-center justify-center rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--status-green) 14%, transparent)",
              }}
            >
              <CheckCircle2
                className="size-6"
                style={{ color: "var(--status-green)" }}
              />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold text-ink">
              Research complete
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              {companies.length}{" "}
              {companies.length === 1 ? "company" : "companies"} enriched with
              call context across{" "}
              <span className="text-ink">{regionsText}</span>. Review the
              dossiers, then start calling.
            </p>

            {companies.length > 0 && (
              <div className="scroll-fade mt-5 max-h-[280px] w-full space-y-2 overflow-y-auto text-left">
                {companies.map((c, i) => (
                  <div
                    key={`${c.name}-${i}`}
                    className="rounded-md border border-border bg-surface-2 px-3.5 py-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[14px] font-semibold text-ink">
                        {c.name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-3">
                        {[c.region, c.country].filter(Boolean).join(", ")} ·{" "}
                        {c.language}
                      </span>
                    </div>
                    {c.specialization && (
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                        {c.specialization}
                      </p>
                    )}
                    {c.notes && (
                      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
                        {c.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={startCalling}
              className="mt-7 flex items-center gap-2 rounded-md bg-clay px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-clay-deep"
            >
              <PhoneCall className="size-4" />
              Start calling {supplierCount} suppliers
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <span
              className="flex size-14 items-center justify-center rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--status-amber) 16%, transparent)",
              }}
            >
              <AlertTriangle
                className="size-6"
                style={{ color: "var(--status-amber)" }}
              />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold text-ink">
              Couldn’t finish deep research
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              {message ?? "The research backend didn’t respond."} You can still
              run the campaign on the drafted plan.
            </p>
            <button
              type="button"
              onClick={startCalling}
              className="mt-7 flex items-center gap-2 rounded-md bg-clay px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-clay-deep"
            >
              <PhoneCall className="size-4" />
              Start demo campaign
            </button>
          </>
        )}

        {status === "idle" && (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-clay-tint">
              <Radio className="size-6 text-clay" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold text-ink">
              Ready when you are
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              {supplierCount} suppliers across {regionsText} are queued for{" "}
              <span className="text-ink">{title}</span>. Your agent will call
              each in their language and hold your price cap.
            </p>
            <button
              type="button"
              onClick={startCalling}
              className="mt-7 flex items-center gap-2 rounded-md bg-clay px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-clay-deep"
            >
              <PhoneCall className="size-4" />
              Start calling {supplierCount} suppliers
            </button>
          </>
        )}
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
