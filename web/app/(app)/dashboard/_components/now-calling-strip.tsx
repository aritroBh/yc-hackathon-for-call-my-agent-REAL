"use client";

import { AnimatePresence, motion } from "motion/react";
import { useAtlas } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { selectActiveCall } from "@/lib/store/selectors";
import { Waveform } from "@/components/shared/waveform";
import { useReducedMotion } from "@/lib/motion/use-reduced-motion";

export function NowCallingStrip() {
  const active = useAtlas(useShallow(selectActiveCall));
  const reduced = useReducedMotion();

  return (
    <div
      aria-live="polite"
      className="flex h-[52px] items-center gap-3 rounded-md border border-border bg-surface px-5"
    >
      <AnimatePresence mode="wait">
        {active ? (
          <motion.div
            key={active.supplierName}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.25 }}
            className="flex flex-1 items-center gap-3"
          >
            <span className="relative flex size-2.5">
              {!reduced && (
                <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-clay" />
              )}
              <span className="relative inline-flex size-2.5 rounded-full bg-clay" />
            </span>
            <span className="flex-1 font-mono text-xs text-ink">
              Now calling · {active.supplierName} · {active.language}
            </span>
            <Waveform active />
          </motion.div>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-mono text-xs text-ink-3"
          >
            No active calls — all suppliers reached.
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
