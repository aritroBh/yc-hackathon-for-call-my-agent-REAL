"use client";

import { AnimatePresence, motion } from "motion/react";
import { Trophy } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { selectBestOffer } from "@/lib/store/selectors";
import { Button } from "@/components/ui/button";
import { money, leadTime } from "@/lib/format";
import { DUR, EASE } from "@/lib/motion/presets";

export function BestOfferBanner() {
  const best = useAtlas(useShallow(selectBestOffer));
  const openDealModal = useAtlas((s) => s.openDealModal);

  return (
    <div
      aria-live="polite"
      className="min-h-[78px] rounded-md border-2 border-clay bg-surface"
    >
      <AnimatePresence mode="wait">
        {best ? (
          <motion.div
            key={best.callId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE.standard }}
            className="flex items-center gap-4 px-5 py-4"
          >
            <Trophy className="size-5 shrink-0 text-clay" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-[0.15em] text-clay">
                BEST OFFER
              </p>
              <p className="truncate font-display text-lg font-semibold text-ink">
                {money(best.unitPrice)} / unit · {best.units} units ·{" "}
                {leadTime(best.leadDays)} lead · {best.supplierName} ({best.city})
              </p>
              <p className="truncate text-xs text-ink-2">
                {money(best.totalSaved)} below your cap · GOTS leather · 40%
                deposit, balance on delivery
              </p>
            </div>
            <Button size="sm" onClick={openDealModal}>
              Lock this deal
            </Button>
          </motion.div>
        ) : (
          <div
            key="empty"
            className="flex h-[78px] items-center gap-3 px-5 text-sm text-ink-3"
          >
            <Trophy className="size-5 text-ink-3" />
            Waiting on the first quote…
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
