"use client";

import { useAtlas } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { selectKpis } from "@/lib/store/selectors";
import { CountUp } from "@/components/shared/count-up";

export function KpiBlock() {
  const kpis = useAtlas(useShallow(selectKpis));

  const cells = [
    { label: "Placed", value: kpis.placed, color: "text-ink" },
    { label: "In progress", value: kpis.inProgress, color: "text-status-amber" },
    { label: "Completed", value: kpis.completed, color: "text-ink" },
    { label: "Deals reached", value: kpis.dealsReached, color: "text-status-green" },
  ];

  return (
    <div className="grid grid-cols-2 gap-y-5 rounded-md border border-border bg-surface p-5">
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col gap-1">
          <CountUp value={c.value} className={`text-2xl font-semibold ${c.color}`} />
          <span className="text-[11px] text-ink-2">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
