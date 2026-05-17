"use client";

import { Tag, Truck, Layers, BadgeCheck } from "lucide-react";
import type { OnboardingAnswers, Language } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface StepProps {
  answers: OnboardingAnswers;
  update: (patch: Partial<OnboardingAnswers>) => void;
}

export interface StepDef {
  eyebrow: string;
  question: string;
  helper: string;
  Body: (p: StepProps) => React.ReactNode;
  isValid: (a: OnboardingAnswers) => boolean;
}

const CATEGORIES = ["Footwear", "Textiles", "Spices & food", "Homeware", "Electronics"];
const REGIONS = ["Nigeria", "Ghana", "India", "Vietnam", "Bangladesh", "Kenya"];

const REGION_LANGUAGE: Record<string, Language> = {
  Nigeria: "Yoruba",
  Ghana: "Twi",
  India: "Hindi",
};

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-4 py-2 text-sm transition-colors",
        active
          ? "border-clay bg-clay-tint font-medium text-clay-deep"
          : "border-border bg-surface text-ink-2 hover:border-ink-3",
      )}
    >
      {children}
    </button>
  );
}

const PRIORITIES: {
  key: OnboardingAnswers["priority"];
  icon: typeof Tag;
  title: string;
  desc: string;
}[] = [
  { key: "lowest-price", icon: Tag, title: "Lowest price", desc: "Drive unit cost down hard. Accept longer lead times if needed." },
  { key: "fastest-delivery", icon: Truck, title: "Fastest delivery", desc: "Prioritize the shortest lead time and ready stock." },
  { key: "bulk-discount", icon: Layers, title: "Bulk discount", desc: "Push for tiered pricing as order volume scales up." },
  { key: "quality-certs", icon: BadgeCheck, title: "Quality certifications", desc: "Require GOTS, ISO or equivalent proof before closing." },
];

export const STEPS: StepDef[] = [
  {
    eyebrow: "WHAT YOU NEED",
    question: "What are you sourcing?",
    helper: "A short description is enough — your agent will ask suppliers for specifics.",
    isValid: (a) => a.product.trim().length > 2 || a.category !== "",
    Body: ({ answers, update }) => (
      <div className="space-y-5">
        <Input
          autoFocus
          placeholder="e.g. Men's full-grain leather sandals, sizes 40–45"
          value={answers.product}
          onChange={(e) => update({ product: e.target.value })}
        />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={answers.category === c}
              onClick={() => update({ category: c, product: c })}
            >
              {c}
            </Chip>
          ))}
        </div>
      </div>
    ),
  },
  {
    eyebrow: "BUDGET & VOLUME",
    question: "What's your budget and order size?",
    helper: "Your agent holds the upper bound as a hard cap unless you say otherwise.",
    isValid: (a) => a.budgetMax > 0 && a.units > 0,
    Body: ({ answers, update }) => (
      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-2">Min $ / unit</span>
          <Input
            type="number"
            value={answers.budgetMin || ""}
            onChange={(e) => update({ budgetMin: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-2">Max $ / unit (cap)</span>
          <Input
            type="number"
            value={answers.budgetMax || ""}
            onChange={(e) => update({ budgetMax: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-2">Units</span>
          <Input
            type="number"
            value={answers.units || ""}
            onChange={(e) => update({ units: Number(e.target.value) })}
          />
        </label>
      </div>
    ),
  },
  {
    eyebrow: "WHERE TO LOOK",
    question: "Any preferred supplier regions?",
    helper: "Optional — leave blank and your agent searches everywhere it can reach.",
    isValid: () => true,
    Body: ({ answers, update }) => (
      <div className="flex flex-wrap gap-2">
        {REGIONS.map((r) => {
          const active = answers.regions.includes(r);
          return (
            <Chip
              key={r}
              active={active}
              onClick={() => {
                const regions = active
                  ? answers.regions.filter((x) => x !== r)
                  : [...answers.regions, r];
                const languages = Array.from(
                  new Set(
                    regions
                      .map((rr) => REGION_LANGUAGE[rr])
                      .filter(Boolean) as Language[],
                  ),
                );
                update({
                  regions,
                  languages: languages.length ? languages : answers.languages,
                });
              }}
            >
              {r}
            </Chip>
          );
        })}
      </div>
    ),
  },
  {
    eyebrow: "HOW THEY'LL SPEAK",
    question: "Languages your agent should call in",
    helper: "Auto-suggested from your regions. Add or remove any.",
    isValid: (a) => a.languages.length > 0,
    Body: ({ answers, update }) => {
      const ALL: Language[] = ["Yoruba", "Twi", "Hindi", "English"];
      return (
        <div className="flex flex-wrap gap-2">
          {ALL.map((l) => {
            const active = answers.languages.includes(l);
            return (
              <Chip
                key={l}
                active={active}
                onClick={() =>
                  update({
                    languages: active
                      ? answers.languages.filter((x) => x !== l)
                      : [...answers.languages, l],
                  })
                }
              >
                {l}
              </Chip>
            );
          })}
        </div>
      );
    },
  },
  {
    eyebrow: "NEGOTIATION PRIORITY",
    question: "What matters most in this deal?",
    helper: "Your agent leads every call around this and won't budge on the rest without checking in.",
    isValid: (a) => !!a.priority,
    Body: ({ answers, update }) => (
      <div className="space-y-3">
        {PRIORITIES.map((p) => {
          const active = answers.priority === p.key;
          const Icon = p.icon;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => update({ priority: p.key })}
              aria-pressed={active}
              className={cn(
                "flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors",
                active
                  ? "border-clay bg-clay-tint"
                  : "border-border bg-surface hover:border-ink-3",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-md",
                  active ? "bg-clay text-white" : "bg-surface-2 text-ink-2",
                )}
              >
                <Icon className="size-[19px]" />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">
                  {p.title}
                </span>
                <span className="block text-[13px] text-ink-2">{p.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    ),
  },
];
