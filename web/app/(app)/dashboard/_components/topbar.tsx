"use client";

import { Pause, Play } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { clock, money } from "@/lib/format";

export function Topbar() {
  const title = useAtlas((s) => s.rfq?.title ?? "Negotiation");
  const elapsed = useAtlas((s) => s.elapsedSeconds);
  const cost = useAtlas((s) => s.totalCostUsd);
  const paused = useAtlas((s) => s.isPausedAll);
  const togglePause = useAtlas((s) => s.togglePauseAll);

  return (
    <header className="flex items-center justify-between border-b border-border px-8 py-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
        <p className="font-mono text-xs text-ink-3">
          6 suppliers · Nigeria &amp; Ghana · Yoruba, Twi
        </p>
      </div>
      <div className="flex items-center gap-5">
        <p className="font-mono text-xs tabular text-ink-2">
          Elapsed {clock(elapsed)} · Est. cost {money(cost)}
        </p>
        <button
          type="button"
          onClick={togglePause}
          className="flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2"
        >
          {paused ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
          {paused ? "Resume all" : "Pause all"}
        </button>
      </div>
    </header>
  );
}
