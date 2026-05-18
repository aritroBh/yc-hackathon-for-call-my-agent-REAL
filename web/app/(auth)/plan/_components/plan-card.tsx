"use client";

import { motion } from "motion/react";
import { FileText, Telescope } from "lucide-react";
import type { SourcingPlan } from "@/lib/types";
import { money, count } from "@/lib/format";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[16px] font-semibold text-ink">
        {value}
      </span>
      <span className="font-mono text-[10px] text-ink-3">{label}</span>
    </div>
  );
}

export function PlanCard({
  plan,
  onEdit,
  onStartCalling,
}: {
  plan: SourcingPlan;
  onEdit: () => void;
  onStartCalling: () => void;
}) {
  const regionsText =
    plan.regions.length === 1
      ? plan.regions[0]
      : plan.regions.join(" & ");

  return (
    <motion.div
      layout
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-[18px] rounded-lg border border-border bg-surface p-7"
    >
      {/* Header */}
      <motion.div layout="position" className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-clay">
          <FileText className="size-3.5 text-white" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-display text-[20px] font-semibold leading-tight text-ink">
            Sourcing plan
          </h2>
          <p className="font-mono text-[12px] text-ink-3">
            {plan.suppliers.length} suppliers · {regionsText} · ~
            {plan.estMinutes} min
          </p>
        </div>
      </motion.div>

      <div className="h-px bg-border-soft" />

      {/* Suppliers — spacing only, no row separators */}
      <motion.div layout="position" className="flex flex-col">
        {plan.suppliers.map((s, i) => (
          <div
            key={`${s.name}-${s.city}-${i}`}
            className="flex items-center gap-3 py-1.5"
          >
            <span className="flex-1 truncate text-[14px] font-semibold text-ink">
              {s.name}
            </span>
            <span className="w-[120px] shrink-0 font-mono text-[12px] text-ink-2">
              {s.city}, {s.countryCode}
            </span>
            <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-ink-2">
              {s.language}
            </span>
          </div>
        ))}
      </motion.div>

      <div className="h-px bg-border-soft" />

      {/* Budget stats */}
      <motion.div layout="position" className="grid grid-cols-4 gap-4">
        <Stat value={money(plan.budget.targetUnit)} label="per-unit target" />
        <Stat value={money(plan.budget.capUnit)} label="hard cap" />
        <Stat value={count(plan.budget.units)} label="units" />
        <Stat
          value={`≈ ${money(plan.budget.estSpend, 0)}`}
          label="est. spend"
        />
      </motion.div>

      <div className="h-px bg-border-soft" />

      {/* Negotiation approach */}
      <motion.div layout="position" className="flex flex-col gap-2.5">
        <p className="font-mono text-[11px] tracking-[0.18em] text-clay">
          NEGOTIATION APPROACH
        </p>
        {plan.negotiation.map((b) => (
          <div key={b} className="flex gap-2.5">
            <span className="select-none font-bold leading-relaxed text-clay">
              •
            </span>
            <span className="text-[13px] leading-relaxed text-ink">{b}</span>
          </div>
        ))}
      </motion.div>

      {/* Footer */}
      <motion.div
        layout="position"
        className="flex items-center justify-between pt-1"
      >
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          Edit details
        </button>
        <button
          type="button"
          onClick={onStartCalling}
          className="flex items-center gap-2 rounded-md bg-clay px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-clay-deep"
        >
          <Telescope className="size-4" />
          Begin research
        </button>
      </motion.div>
    </motion.div>
  );
}
