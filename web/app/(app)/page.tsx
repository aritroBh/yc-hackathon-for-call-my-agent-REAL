"use client";

/**
 * Home — sourcing cockpit. KPI tiles + a dynamic agent briefing + the
 * run lists (Active / Previous). Glanceable overview; all chatting
 * happens in the right-rail dock.
 */

import Link from "next/link";
import { motion } from "motion/react";
import {
  Plus,
  Telescope,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ChevronRight,
} from "lucide-react";
import { useAtlas } from "@/lib/store";
import { selectRunList, type RunSummary } from "@/lib/store/selectors";
import { relativeTime } from "@/lib/format";
import { fadeUp, fadeUpTransition } from "@/lib/motion/presets";
import { CountUp } from "@/components/shared/count-up";

function StatIcon({ status }: { status: RunSummary["status"] }) {
  if (status === "researching")
    return <Loader2 className="size-4 animate-spin text-clay" />;
  if (status === "calling") return <Radio className="size-4 text-clay" />;
  if (status === "complete")
    return (
      <CheckCircle2 className="size-4" style={{ color: "var(--status-green)" }} />
    );
  if (status === "error")
    return (
      <AlertTriangle
        className="size-4"
        style={{ color: "var(--status-amber)" }}
      />
    );
  return <Telescope className="size-4 text-ink-3" />;
}

function subline(r: RunSummary): string {
  switch (r.status) {
    case "researching":
      return r.message ?? "Researching suppliers…";
    case "calling":
      return `Calling · ${r.callsDone}/${r.callsTotal} done`;
    case "complete":
      return `${r.dealsReached} deal${r.dealsReached === 1 ? "" : "s"}${
        r.bestPrice != null ? ` · best $${r.bestPrice.toFixed(2)}` : ""
      }`;
    case "error":
      return "Deep research failed";
    default:
      return r.isDemo ? "Ready-to-call sample run" : "Ready to call";
  }
}

function RunRow({ r, i }: { r: RunSummary; i: number }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ ...fadeUpTransition, delay: Math.min(i * 0.04, 0.2) }}
    >
      <Link
        href={`/research/${r.id}`}
        className="flex items-center gap-4 rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:border-clay/50"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2">
          <StatIcon status={r.status} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink">
              {r.title}
            </span>
            {r.isDemo && (
              <span className="shrink-0 rounded-full bg-clay-tint px-2 py-0.5 font-mono text-[10px] font-semibold text-clay-deep">
                DEMO
              </span>
            )}
          </div>
          <span className="truncate font-mono text-[12px] text-ink-2">
            {subline(r)}
          </span>
        </div>
        <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 sm:block">
          {r.regionLabel}
        </span>
        <span className="w-20 shrink-0 text-right font-mono text-[11px] text-ink-3">
          {relativeTime(r.createdAt)}
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" />
      </Link>
    </motion.div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-5 py-4">
      {typeof value === "number" ? (
        <CountUp
          value={value}
          className={`font-display text-[28px] font-semibold leading-none ${
            accent ?? "text-ink"
          }`}
        />
      ) : (
        <span
          className={`font-display text-[28px] font-semibold leading-none ${
            accent ?? "text-ink"
          }`}
        >
          {value}
        </span>
      )}
      <span className="font-mono text-[11px] text-ink-3">{label}</span>
    </div>
  );
}

export default function HomePage() {
  const runs = useAtlas(selectRunList);

  const active = runs.filter(
    (r) => r.status === "researching" || r.status === "calling",
  );
  const previous = runs.filter(
    (r) => r.status !== "researching" && r.status !== "calling",
  );
  const deals = runs.reduce((n, r) => n + r.dealsReached, 0);
  const dealsToday = runs.reduce((n, r) => n + r.dealsToday, 0);
  const best = runs.reduce<number | null>(
    (b, r) =>
      r.bestPrice == null ? b : b == null ? r.bestPrice : Math.min(b, r.bestPrice),
    null,
  );

  const briefing =
    deals > 0
      ? `${deals} deal${deals === 1 ? "" : "s"} closed${
          best != null ? ` · best $${best.toFixed(2)}/unit` : ""
        }${active.length > 0 ? ` · ${active.length} run${active.length === 1 ? "" : "s"} in progress` : ""}`
      : active.length > 0
        ? `${active.length} run${active.length === 1 ? "" : "s"} in progress — deals will land here`
        : "Start a research run to see your deals here";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-8 py-5">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">
            Sourcing overview
          </h1>
          <p className="font-mono text-xs text-ink-3">{briefing}</p>
        </div>
        <Link
          href="/onboarding"
          className="flex items-center gap-2 rounded-md bg-clay px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-clay-deep"
        >
          <Plus className="size-4" />
          New research run
        </Link>
      </header>

      <div className="scroll-fade flex-1 overflow-y-auto p-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Total runs" value={runs.length} />
            <StatTile
              label="Active research"
              value={active.length}
              accent={active.length > 0 ? "text-clay" : "text-ink"}
            />
            <StatTile
              label="Deals reached"
              value={deals}
              accent="text-[color:var(--status-green)]"
            />
            <StatTile
              label="Deals made today"
              value={dealsToday}
              accent={
                dealsToday > 0
                  ? "text-[color:var(--status-green)]"
                  : "text-ink"
              }
            />
          </div>

          {/* Runs */}
          <div className="flex flex-col gap-7">
            {active.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <p className="font-mono text-[11px] tracking-[0.18em] text-clay">
                  ACTIVE
                </p>
                {active.map((r, i) => (
                  <RunRow key={r.id} r={r} i={i} />
                ))}
              </section>
            )}

            <section className="flex flex-col gap-2.5">
              <p className="font-mono text-[11px] tracking-[0.18em] text-ink-3">
                PREVIOUS RESEARCH &amp; CALLS
              </p>
              {previous.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center">
                  <p className="text-[14px] text-ink-2">
                    No past runs yet — start your first one.
                  </p>
                </div>
              ) : (
                previous.map((r, i) => <RunRow key={r.id} r={r} i={i} />)
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
