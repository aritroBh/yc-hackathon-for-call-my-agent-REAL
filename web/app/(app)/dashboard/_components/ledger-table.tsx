"use client";

import { motion } from "motion/react";
import { useAtlas } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { selectLedgerRows } from "@/lib/store/selectors";
import { staggerParent } from "@/lib/motion/presets";
import { LedgerRow } from "./ledger-row";

const COLS = [
  { label: "SUPPLIER", className: "flex-1" },
  { label: "LANGUAGE", className: "w-[120px]" },
  { label: "OFFER", className: "w-[140px]" },
  { label: "LEAD TIME", className: "w-[120px]" },
  { label: "STATUS", className: "w-[170px]" },
  { label: "", className: "w-10" },
];

export function LedgerTable() {
  const rows = useAtlas(useShallow(selectLedgerRows));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center border-b border-border bg-surface-2 px-5 py-3">
        {COLS.map((c) => (
          <span
            key={c.label || "spacer"}
            className={`font-mono text-[10px] tracking-[0.1em] text-ink-3 ${c.className}`}
          >
            {c.label}
          </span>
        ))}
      </div>
      <motion.div
        variants={staggerParent}
        initial="initial"
        animate="animate"
      >
        {rows.map((row) => (
          <LedgerRow key={row.callId} row={row} />
        ))}
      </motion.div>
    </div>
  );
}
