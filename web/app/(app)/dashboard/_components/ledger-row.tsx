"use client";

import { motion, AnimatePresence } from "motion/react";
import { ChevronRight } from "lucide-react";
import type { LedgerRow as Row } from "@/lib/store/selectors";
import { StatusChip } from "@/components/shared/status-chip";
import { staggerChild, staggerChildTransition, DUR, EASE } from "@/lib/motion/presets";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LedgerRowDetail } from "./ledger-row-detail";

function dotColor(row: Row): string {
  if (row.status === "completed")
    return row.unitPrice != null ? "bg-status-green" : "bg-status-red";
  if (row.status === "capped") return "bg-status-red";
  if (row.status === "in-progress") return "bg-status-amber";
  return "bg-ink-3";
}

export function LedgerRow({
  row,
  open,
  onToggle,
}: {
  row: Row;
  open: boolean;
  onToggle: () => void;
}) {
  const isDeal = row.status === "completed" && row.unitPrice != null;
  const detailId = `detail-${row.callId}`;

  return (
    <motion.div
      layout
      variants={staggerChild}
      transition={staggerChildTransition}
      className={cn(
        "border-b border-border last:border-b-0",
        row.isBest && "bg-clay-tint/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={detailId}
        className="flex w-full items-center gap-0 px-5 py-4 text-left transition-colors hover:bg-surface-2/60"
      >
        <div className="flex flex-1 items-center gap-3">
          <span className={cn("size-2.5 shrink-0 rounded-full", dotColor(row))} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold text-ink">
              {row.supplierName}
            </span>
            <span className="truncate text-xs text-ink-2">
              {row.city}, {row.region}
              {row.isBest && " · best offer"}
            </span>
          </div>
        </div>

        <span className="w-[120px] font-mono text-xs text-ink-2">
          {row.language}
        </span>

        <span className="flex w-[140px] items-baseline gap-1">
          <span className="font-display text-lg font-semibold tabular text-ink">
            {row.unitPrice != null ? money(row.unitPrice) : "-"}
          </span>
          {row.unitPrice != null && (
            <span className="font-mono text-[11px] text-ink-3">/unit</span>
          )}
        </span>

        <span className="w-[120px] font-mono text-[13px] tabular text-ink">
          {row.leadDays != null ? `${row.leadDays} days` : "-"}
        </span>

        <span className="w-[170px]">
          <StatusChip status={row.status} phase={row.phase} isDeal={isDeal} />
        </span>

        <span className="flex w-10 justify-end">
          <ChevronRight
            className={cn(
              "size-4 text-ink-3 transition-transform",
              open && "rotate-90",
            )}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={detailId}
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.standard }}
            className="overflow-hidden"
          >
            <LedgerRowDetail callId={row.callId} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
