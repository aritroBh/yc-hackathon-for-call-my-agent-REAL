"use client";

import { useAtlas } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { selectDonut } from "@/lib/store/selectors";

const R = 38;
const C = 2 * Math.PI * R;

export function StatusDonut() {
  const d = useAtlas(useShallow(selectDonut));
  const total = Math.max(1, d.reached + d.declined + d.pending);

  const segments = [
    { key: "Reached", value: d.reached, color: "var(--status-green)" },
    { key: "Declined", value: d.declined, color: "var(--status-red)" },
    { key: "Pending", value: d.pending, color: "var(--status-amber)" },
  ];

  let acc = 0;

  return (
    <div className="flex items-center gap-5 rounded-md border border-border bg-surface p-5">
      <svg width="92" height="92" viewBox="0 0 92 92" className="-rotate-90">
        <circle
          cx="46"
          cy="46"
          r={R}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth="10"
        />
        {segments.map((s) => {
          const frac = s.value / total;
          const dash = frac * C;
          const el = (
            <circle
              key={s.key}
              cx="46"
              cy="46"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="10"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-acc * C}
              style={{ transition: "stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease" }}
            />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <div className="flex flex-col gap-2.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ background: s.color }}
            />
            <span className="flex-1 text-xs text-ink-2">{s.key}</span>
            <span className="font-mono text-xs font-semibold tabular text-ink">
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
