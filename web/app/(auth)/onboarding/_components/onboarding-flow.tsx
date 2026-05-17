"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import type { OnboardingAnswers } from "@/lib/types";
import { markOnboarded } from "@/lib/auth/mock-auth";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "./progress-bar";
import { STEPS } from "./onboarding-steps";
import { slideLeft, slideLeftTransition } from "@/lib/motion/presets";

const INITIAL: OnboardingAnswers = {
  product: "",
  category: "",
  budgetMin: 4,
  budgetMax: 5,
  units: 500,
  regions: [],
  languages: [],
  priority: "lowest-price",
};

export function OnboardingFlow() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(INITIAL);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const canAdvance = step.isValid(answers);

  const update = (patch: Partial<OnboardingAnswers>) =>
    setAnswers((a) => ({ ...a, ...patch }));

  function next() {
    if (!canAdvance) return;
    if (isLast) {
      markOnboarded();
      router.push("/dashboard");
      return;
    }
    setIndex((i) => i + 1);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-semibold text-ink">
            haggl
          </span>
          <span className="size-1.5 rounded-full bg-clay" />
        </div>
        <span className="font-mono text-xs text-ink-3">
          Step {index + 1} of {STEPS.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            variants={slideLeft}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={slideLeftTransition}
          >
            <p className="font-mono text-xs tracking-[0.2em] text-clay">
              {step.eyebrow}
            </p>
            <h1 className="mt-3.5 font-display text-[34px] font-semibold leading-tight text-ink">
              {step.question}
            </h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
              {step.helper}
            </p>
            <div className="mt-8">
              <step.Body answers={answers} update={update} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between">
        <ProgressBar current={index} total={STEPS.length} />
        <div className="flex items-center gap-2">
          {index > 0 && (
            <Button
              variant="ghost"
              onClick={() => setIndex((i) => i - 1)}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
          )}
          <Button onClick={next} disabled={!canAdvance}>
            {isLast ? "Start sourcing" : "Continue"}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
