"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, ArrowUp } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { playDealCue } from "@/lib/sound";
import { fadeUp, fadeUpTransition } from "@/lib/motion/presets";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import type { SourcingPlan } from "@/lib/types";
import { PlanCard } from "./plan-card";

interface Turn {
  id: string;
  role: "user" | "agent";
  content: string;
}

const COMMIT_CHIP = "Looks good — start calling";

function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-clay">
        <Sparkles className="size-3.5 text-white" />
      </span>
      <div className="max-w-[560px] rounded-md bg-surface-2 px-3.5 py-3 text-[14px] leading-relaxed text-ink">
        {children}
      </div>
    </div>
  );
}

export function PlanCanvas() {
  const router = useRouter();
  const plan = useAtlas((s) => s.plan);
  const setPlan = useAtlas((s) => s.setPlan);
  const beginCampaign = useAtlas((s) => s.beginCampaign);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Direct hit with no plan → go back and generate one.
  useEffect(() => {
    if (!plan) router.replace("/planning");
  }, [plan, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns.length, busy]);

  if (!plan) return null;

  async function refine(message: string) {
    const text = message.trim();
    if (!text || busy || committed) return;
    const current = useAtlas.getState().plan;
    if (!current) return;

    setTurns((t) => [
      ...t,
      { id: `u_${Date.now()}`, role: "user", content: text },
    ]);
    setDraft("");
    setBusy(true);

    try {
      const res = await fetch("/api/plan/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: current, message: text }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        plan?: SourcingPlan;
        reply?: string;
      };
      if (data?.ok && data.plan) setPlan(data.plan);
      setTurns((t) => [
        ...t,
        {
          id: `a_${Date.now()}`,
          role: "agent",
          content:
            data?.reply ?? "Updated the plan above — take another look.",
        },
      ]);
    } catch {
      setTurns((t) => [
        ...t,
        {
          id: `a_err_${Date.now()}`,
          role: "agent",
          content: "I lost the connection for a second — say that again?",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function commit() {
    if (committed) return;
    setCommitted(true);
    playDealCue();
    beginCampaign();
    router.push("/dashboard");
  }

  function onChip(label: string) {
    if (label === COMMIT_CHIP) commit();
    else void refine(label);
  }

  function focusComposer() {
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const chips = [
    "Add more suppliers",
    "Lower the price cap",
    `Focus only on ${plan.regions[0]}`,
    COMMIT_CHIP,
  ];

  return (
    <div className="flex h-screen flex-col bg-paper">
      {/* Top bar */}
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-surface px-7">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-[19px] font-semibold text-ink">
            haggl
          </span>
          <span className="size-1.5 rounded-full bg-clay" />
          <span className="font-mono text-[13px] text-ink-3">
            / sourcing plan
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="rounded-md px-3 py-1.5 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          Discard
        </button>
      </header>

      {/* Thread */}
      <div ref={scrollRef} className="scroll-fade flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-6 py-9">
          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={fadeUpTransition}
          >
            <AgentBubble>
              Here’s the plan. {plan.summary} Have a look and tell me what to
              tweak.
            </AgentBubble>
          </motion.div>

          <div className="ml-[38px]">
            <PlanCard plan={plan} onEdit={focusComposer} onStartCalling={commit} />
          </div>

          {!committed && (
            <motion.div
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={fadeUpTransition}
              className="ml-[38px] flex flex-wrap gap-2"
            >
              {chips.map((c) => {
                const primary = c === COMMIT_CHIP;
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={busy}
                    onClick={() => onChip(c)}
                    className={
                      primary
                        ? "rounded-full border border-clay bg-clay-tint px-3 py-1.5 text-[13px] font-medium text-clay-deep transition-colors hover:bg-clay hover:text-white disabled:opacity-50"
                        : "rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-clay hover:text-clay-deep disabled:opacity-50"
                    }
                  >
                    {c}
                  </button>
                );
              })}
            </motion.div>
          )}

          {turns.map((t) =>
            t.role === "user" ? (
              <motion.div
                key={t.id}
                variants={fadeUp}
                initial="initial"
                animate="animate"
                transition={fadeUpTransition}
                className="flex justify-end"
              >
                <div className="max-w-[80%] rounded-md bg-clay-tint px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">
                  {t.content}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={t.id}
                variants={fadeUp}
                initial="initial"
                animate="animate"
                transition={fadeUpTransition}
              >
                <AgentBubble>{t.content}</AgentBubble>
              </motion.div>
            ),
          )}

          <AnimatePresence>
            {busy && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="ml-[38px] w-fit"
              >
                <TypingIndicator />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void refine(draft);
        }}
        className="shrink-0 border-t border-border bg-surface px-6 py-4"
      >
        <div className="mx-auto flex max-w-[760px] items-center gap-2.5">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Refine the plan…"
            aria-label="Refine the plan"
            disabled={busy || committed}
            className="flex-1 rounded-md border border-border bg-surface-2 px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 focus-visible:border-clay disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Send refinement"
            disabled={busy || committed || !draft.trim()}
            className="flex size-[38px] items-center justify-center rounded-md bg-clay text-white transition-colors hover:bg-clay-deep disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
