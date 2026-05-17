"use client";

import { motion } from "motion/react";
import { useAtlas } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { selectRegionRows } from "@/lib/store/selectors";
import { DUR, EASE } from "@/lib/motion/presets";

export function RegionBreakdown() {
  const rows = useAtlas(useShallow(selectRegionRows));

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5">
      <p className="font-mono text-[10px] tracking-[0.15em] text-ink-3">
        BY REGION
      </p>
      {rows.length === 0 && (
        <p className="text-sm text-ink-3">No calls placed yet.</p>
      )}
      {rows.map((r) => (
        <div key={`${r.region}-${r.language}`} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-ink">
              {r.region} · {r.language}
            </span>
            <span className="font-mono text-xs tabular text-ink-2">
              {r.calls} calls · {r.deals} deals
            </span>
          </div>
          <div className="h-[7px] overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-clay"
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(r.ratio * 100)}%` }}
              transition={{ duration: DUR.slow, ease: EASE.standard }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
