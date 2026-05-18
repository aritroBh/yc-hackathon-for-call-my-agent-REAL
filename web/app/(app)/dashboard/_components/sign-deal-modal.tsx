"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import {
  CheckCircle2,
  Loader2,
  PenLine,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { useAtlas } from "@/lib/store";
import { selectBestOffer } from "@/lib/store/selectors";
import { Button } from "@/components/ui/button";
import { money, leadTime } from "@/lib/format";
import { DUR, EASE } from "@/lib/motion/presets";
import type { OnboardingAnswers } from "@/lib/types";

const PRIORITY_LABEL: Record<OnboardingAnswers["priority"], string> = {
  "lowest-price": "lowest price",
  "fastest-delivery": "fastest delivery",
  "bulk-discount": "best bulk pricing",
  "quality-certs": "quality & certifications",
};

export function SignDealModal() {
  const best = useAtlas(useShallow(selectBestOffer));
  const deal = useAtlas(useShallow((s) => s.deal));
  const rfq = useAtlas((s) => s.rfq);
  const priority = useAtlas((s) => s.onboardingAnswers?.priority ?? null);
  const signDeal = useAtlas((s) => s.signDeal);
  const dismissDealModal = useAtlas((s) => s.dismissDealModal);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const open =
    !deal.dismissed && deal.status !== "idle" && best !== null;

  const partName = rfq?.items[0]?.description ?? rfq?.title ?? "your order";
  const reason = priority ? PRIORITY_LABEL[priority] : "lowest price";

  function handleSign() {
    if (!best) return;
    signDeal({
      supplierName: best.supplierName,
      amount: best.unitPrice,
      currency: "USD",
      rfqId: rfq?.id ?? "rfq",
      rfqTitle: rfq?.title ?? "your order",
      partName,
      quantity: best.units,
      leadDays: best.leadDays,
    });
  }

  // Hard-conditional unmount (no AnimatePresence exit): the dashboard
  // simulator re-renders this subtree every ~300ms, which races
  // AnimatePresence's exit-complete callback and can leave an invisible
  // fixed overlay trapping clicks. Returning null closes it instantly.
  if (!mounted || !open || !best) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DUR.fast, ease: EASE.soft }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sign the best deal"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DUR.slow, ease: EASE.standard }}
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
      >
            <div className="flex items-center gap-3 border-b border-border bg-clay-tint px-6 py-4">
              <span className="flex size-9 items-center justify-center rounded-full bg-clay/15">
                <Trophy className="size-4 text-clay" />
              </span>
              <div>
                <p className="font-mono text-[10px] tracking-[0.15em] text-clay">
                  NEGOTIATION COMPLETE
                </p>
                <h2 className="font-display text-lg font-semibold text-ink">
                  This is the best deal
                </h2>
              </div>
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-ink-2">
                Your agent finished every call and ranked them on{" "}
                <span className="font-medium text-ink">{reason}</span> — what
                you asked for.
              </p>

              <div className="mt-4 rounded-lg border border-border bg-surface-2 px-4 py-4">
                <p className="font-display text-2xl font-semibold text-ink">
                  {money(best.unitPrice)}
                  <span className="text-sm font-normal text-ink-2">
                    {" "}
                    / unit
                  </span>
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {best.supplierName} ({best.city}) · {best.units} units ·{" "}
                  {leadTime(best.leadDays)} lead
                </p>
                {best.totalSaved > 0 && (
                  <p className="mt-2 text-sm font-medium text-clay">
                    {money(best.totalSaved)} below your cap
                  </p>
                )}
              </div>

              {deal.status === "paid" ? (
                <div className="mt-5 flex items-start gap-3 rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                  <div className="text-sm">
                    <p className="font-medium text-ink">Paid via Sponge.</p>
                    <p className="text-ink-2">
                      Receipt emailed to{" "}
                      <span className="text-ink">
                        {deal.receiptEmail ?? "your inbox"}
                      </span>
                      .
                    </p>
                    {deal.paymentId && (
                      <p className="mt-1 font-mono text-[11px] text-ink-3">
                        ref {deal.paymentId}
                      </p>
                    )}
                  </div>
                </div>
              ) : deal.status === "error" ? (
                <div className="mt-5 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
                  <div className="text-sm">
                    <p className="font-medium text-ink">Payment failed.</p>
                    <p className="text-ink-2">
                      {deal.error ?? "Something went wrong."}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              {deal.status === "paid" ? (
                <Button onClick={dismissDealModal}>Done</Button>
              ) : deal.status === "signing" ? (
                <Button disabled>
                  <Loader2 className="size-4 animate-spin" />
                  Signing &amp; paying…
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={dismissDealModal}>
                    Not now
                  </Button>
                  <Button onClick={handleSign}>
                    <PenLine className="size-4" />
                    {deal.status === "error"
                      ? "Try again"
                      : "Sign & pay now"}
                  </Button>
                </>
              )}
            </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
