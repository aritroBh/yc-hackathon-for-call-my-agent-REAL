"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ScanLine, Check, RotateCw } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { buildFallbackPlan } from "@/lib/plan";
import { useReducedMotion } from "@/lib/motion/use-reduced-motion";
import type { SourcingPlan } from "@/lib/types";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

type StepState = "pending" | "active" | "complete";

/** Clay partial-arc spinner — matches the B3 mockup's 270° ring. */
function Spinner() {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      animate={reduced ? {} : { rotate: 360 }}
      transition={
        reduced ? undefined : { duration: 0.85, repeat: Infinity, ease: "linear" }
      }
    >
      <circle cx="11" cy="11" r="8" stroke="var(--border)" strokeWidth="2" />
      <path
        d="M11 3a8 8 0 0 1 8 8"
        stroke="var(--clay)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

function StatusMark({ state }: { state: StepState }) {
  return (
    <span className="flex size-[22px] shrink-0 items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        {state === "complete" ? (
          <motion.span
            key="done"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex size-[22px] items-center justify-center rounded-full bg-clay"
          >
            <Check className="size-3.5 text-white" strokeWidth={3} />
          </motion.span>
        ) : state === "active" ? (
          <motion.span
            key="spin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Spinner />
          </motion.span>
        ) : (
          <motion.span
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="size-[18px] rounded-full border-[1.5px] border-ink-3/45"
          />
        )}
      </AnimatePresence>
    </span>
  );
}

export function PlanningLoader() {
  const router = useRouter();
  const answers = useAtlas((s) => s.onboardingAnswers);
  const setPlan = useAtlas((s) => s.setPlan);
  const reduced = useReducedMotion();

  // Preview content is deterministic and instant; the resolved plan
  // (Gemini-enriched) replaces it for the final counts when it lands.
  const preview = useMemo<SourcingPlan | null>(
    () => (answers ? buildFallbackPlan(answers) : null),
    [answers],
  );

  const [activeStep, setActiveStep] = useState(0);
  const [done, setDone] = useState<boolean[]>([false, false, false, false, false]);
  const [errored, setErrored] = useState(false);
  const [holding, setHolding] = useState(false);

  const planRef = useRef<SourcingPlan | null>(null);
  const readyRef = useRef(false);
  const errRef = useRef(false);
  const runId = useRef(0);

  // Direct refresh with no captured answers → restart onboarding.
  useEffect(() => {
    if (!answers) router.replace("/onboarding");
  }, [answers, router]);

  const startGeneration = useCallback(() => {
    errRef.current = false;
    readyRef.current = false;
    planRef.current = null;
    if (!answers) return;
    fetch("/api/plan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    })
      .then((r) => r.json())
      .then((data: { ok: boolean; plan?: SourcingPlan }) => {
        if (data?.ok && data.plan) {
          planRef.current = data.plan;
          readyRef.current = true;
        } else {
          errRef.current = true;
        }
      })
      .catch(() => {
        errRef.current = true;
      });
  }, [answers]);

  const runSequence = useCallback(
    async (floorMs: number) => {
      const myRun = ++runId.current;
      const cancelled = () => myRun !== runId.current;
      const startedAt = Date.now();

      setActiveStep(0);
      setDone([false, false, false, false, false]);
      setErrored(false);
      setHolding(false);

      // Steps 1–4 reveal on a steady cadence; brisker once the plan
      // has already landed (response faster than the staged UX).
      for (let i = 0; i < 4; i++) {
        await wait(readyRef.current ? 650 : 1800);
        if (cancelled()) return;
        setDone((d) => {
          const n = [...d];
          n[i] = true;
          return n;
        });
        setActiveStep(i + 1);
      }

      // Hold on "Drafting" until the plan is ready AND the floor has
      // elapsed; surface a soft note past 15s; stop on error.
      while (!cancelled()) {
        if (errRef.current) {
          setErrored(true);
          return;
        }
        const elapsed = Date.now() - startedAt;
        if (readyRef.current && elapsed >= floorMs) break;
        if (!readyRef.current && elapsed >= 15000) setHolding(true);
        await wait(150);
      }
      if (cancelled()) return;

      setHolding(false);
      setDone([true, true, true, true, true]);
      await wait(reduced ? 250 : 700);
      if (cancelled()) return;
      if (planRef.current) setPlan(planRef.current);
      router.push("/plan");
    },
    [reduced, router, setPlan],
  );

  useEffect(() => {
    if (!answers) return;
    startGeneration();
    void runSequence(8000);
    return () => {
      // Invalidate any in-flight sequence (generation counter, not a
      // DOM ref) so a remount/unmount can't double-advance or route.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      runId.current++;
    };
  }, [answers, startGeneration, runSequence]);

  const p = planRef.current ?? preview;
  const cities = p
    ? Array.from(new Set(p.suppliers.map((s) => s.city))).slice(0, 3)
    : [];

  const steps: { label: string; meta?: string }[] = [
    {
      label: "Read your brief",
      meta: p ? `${p.budget.units.toLocaleString("en-US")} units` : undefined,
    },
    {
      label: `Scoped the ${p?.productLabel ?? "supplier"} market`,
      meta: p ? listJoin(p.regions) : undefined,
    },
    {
      label: `Scanning suppliers in ${listJoin(cities) || "your regions"}`,
      meta: p ? `${p.suppliers.length} found` : undefined,
    },
    {
      label: `Matching to your priority — ${p?.priorityLabel ?? "best overall"}`,
    },
    { label: "Drafting the negotiation plan" },
  ];

  function stateOf(i: number): StepState {
    if (done[i]) return "complete";
    if (i === activeStep && !errored) return "active";
    return "pending";
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-paper px-6 py-12">
      <div className="flex items-center gap-2">
        <span className="font-display text-lg font-semibold text-ink">haggl</span>
        <span className="size-1.5 rounded-full bg-clay" />
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="w-[520px] max-w-[calc(100vw-3rem)] rounded-lg border border-border bg-surface p-8"
        >
          <div className="flex items-center gap-3.5">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-md bg-clay">
              <ScanLine className="size-5 text-white" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h1 className="font-display text-[22px] font-semibold leading-tight text-ink">
                Building your sourcing plan
              </h1>
              <p className="font-mono text-[12px] text-ink-3">
                {holding
                  ? "Still drafting — almost there"
                  : "Analyzing your brief — about 10 seconds"}
              </p>
            </div>
          </div>

          <div className="my-6 h-px bg-border-soft" />

          <ul className="flex flex-col gap-4">
            {steps.map((step, i) => {
              const state = stateOf(i);
              return (
                <motion.li
                  key={step.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: i * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="flex items-center gap-3"
                >
                  <StatusMark state={state} />
                  <span
                    className={
                      "flex-1 text-[15px] " +
                      (state === "pending"
                        ? "text-ink-3"
                        : state === "active"
                          ? "font-semibold text-ink"
                          : "text-ink")
                    }
                  >
                    {step.label}
                  </span>
                  <AnimatePresence>
                    {state === "complete" && step.meta && (
                      <motion.span
                        key="meta"
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="font-mono text-[12px] text-ink-3"
                      >
                        {step.meta}
                      </motion.span>
                    )}
                    {state === "active" && i === 2 && p && (
                      <motion.span
                        key="found"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="font-mono text-[12px] text-clay"
                      >
                        {p.suppliers.length} found
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ul>

          <AnimatePresence>
            {errored && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-4 py-3"
              >
                <p className="text-[13px] text-ink-2">
                  Couldn’t reach the planner.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    startGeneration();
                    void runSequence(4000);
                  }}
                  className="flex items-center gap-1.5 rounded-md bg-clay px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-clay-deep"
                >
                  <RotateCw className="size-3.5" />
                  Retry
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
