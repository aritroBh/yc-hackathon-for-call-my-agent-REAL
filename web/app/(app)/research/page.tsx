"use client";

/**
 * Research — the multi-run manager. Lists every run (active + previous +
 * the demo), reading `selectRunList`. Tap a run → /research/[id].
 * "New research run" enters the existing onboarding → plan → commit flow,
 * which calls `createRun` and routes back here into the new run.
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

function StatusIcon({ status }: { status: RunSummary["status"] }) {
  if (status === "researching")
    return <Loader2 className="size-4 animate-spin text-clay" />;
  if (status === "calling")
    return <Radio className="size-4 text-clay" />;
  if (status === "complete")
    return (
      <CheckCircle2
        className="size-4"
        style={{ color: "var(--status-green)" }}
      />
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
      return `Complete · ${r.dealsReached} deal${
        r.dealsReached === 1 ? "" : "s"
      }${r.bestPrice != null ? ` · best $${r.bestPrice.toFixed(2)}` : ""}`;
    case "error":
      return "Deep research failed — open to retry or use demo";
    default:
      return r.isDemo
        ? "Ready-to-call sample run"
        : `${r.dossierCount} dossiers · ready to call`;
  }
}

export default function ResearchListPage() {
  const runs = useAtlas(selectRunList);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-8 py-5">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">
            Research
          </h1>
          <p className="font-mono text-xs text-ink-3">
            Runs your agent is investigating
          </p>
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
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
          {runs.map((r, i) => (
            <motion.div
              key={r.id}
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
                  <StatusIcon status={r.status} />
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
                <span className="w-24 shrink-0 text-right font-mono text-[11px] text-ink-3">
                  {relativeTime(r.createdAt)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-3" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
