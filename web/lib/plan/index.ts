/**
 * Deterministic sourcing-plan logic shared by the Gemini route handlers
 * and used as their fallback. The fallback is always a valid
 * `SourcingPlan`, so `/planning` and `/plan` work even with no
 * `GEMINI_API_KEY` or a model error — important for live demos.
 */

import type {
  OnboardingAnswers,
  SourcingPlan,
  PlanSupplier,
  Language,
} from "@/lib/types";

export const PRIORITY_LABEL: Record<OnboardingAnswers["priority"], string> = {
  "lowest-price": "Lowest price",
  "fastest-delivery": "Fastest delivery",
  "bulk-discount": "Bulk discount",
  "quality-certs": "Quality certifications",
};

interface RegionMeta {
  country: string;
  code: string;
  language: Language;
  cities: string[];
  suppliers: string[];
}

/** Regions the agent can actually reach (West Africa + India). */
const REGIONS: Record<string, RegionMeta> = {
  Nigeria: {
    country: "Nigeria",
    code: "NG",
    language: "Yoruba",
    cities: ["Aba", "Lagos", "Kano"],
    suppliers: ["Adebayo Leatherworks", "Lagos Hide & Co.", "Niger Delta Tannery"],
  },
  Ghana: {
    country: "Ghana",
    code: "GH",
    language: "Twi",
    cities: ["Kumasi", "Accra", "Tema"],
    suppliers: ["Ashanti Craft Exports", "Kumasi Leather Guild", "Accra Sandal Works"],
  },
  India: {
    country: "India",
    code: "IN",
    language: "Hindi",
    cities: ["Kanpur", "Agra", "Chennai"],
    suppliers: ["Kanpur Leather Mills", "Agra Footwear Export", "Chennai Tannery Co."],
  },
};

const DEFAULT_REGIONS = ["Nigeria", "Ghana"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Regions from answers, filtered to ones we can reach. */
export function planRegions(answers: OnboardingAnswers): string[] {
  const known = (answers.regions ?? []).filter((r) => REGIONS[r]);
  return known.length ? known : DEFAULT_REGIONS;
}

export function productLabelOf(answers: OnboardingAnswers): string {
  const raw = (answers.product || answers.category || "your goods").trim();
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

/** Up to 6 suppliers, spread evenly across the chosen regions. */
function pickSuppliers(regions: string[]): PlanSupplier[] {
  const perRegion = Math.max(1, Math.floor(6 / regions.length));
  const out: PlanSupplier[] = [];
  for (const r of regions) {
    const meta = REGIONS[r];
    if (!meta) continue;
    for (let i = 0; i < perRegion && out.length < 6; i++) {
      out.push({
        name: meta.suppliers[i % meta.suppliers.length],
        city: meta.cities[i % meta.cities.length],
        countryCode: meta.code,
        country: meta.country,
        language: meta.language,
      });
    }
  }
  // Top up to 6 if integer division left us short.
  let ri = 0;
  while (out.length < 6 && regions.some((r) => REGIONS[r])) {
    const meta = REGIONS[regions[ri % regions.length]];
    ri++;
    if (!meta) continue;
    const idx = out.filter((s) => s.country === meta.country).length;
    if (idx >= meta.suppliers.length) break;
    out.push({
      name: meta.suppliers[idx],
      city: meta.cities[idx % meta.cities.length],
      countryCode: meta.code,
      country: meta.country,
      language: meta.language,
    });
  }
  return out;
}

function negotiationBullets(
  answers: OnboardingAnswers,
  target: number,
  cap: number,
): string[] {
  const anchor = round2(Math.max(0.5, target - 0.4));
  const bullets: string[] = [];
  if (answers.priority === "bulk-discount") {
    bullets.push(`Push for tiered pricing — steeper discounts as volume scales past 250 units.`);
  }
  bullets.push(`Anchor at $${anchor.toFixed(2)}/unit and settle toward $${target.toFixed(2)}.`);
  if (answers.priority !== "bulk-discount") {
    bullets.push(`Ask for a bulk discount above 250 units.`);
  }
  if (answers.priority === "quality-certs") {
    bullets.push(`Require GOTS / ISO certification up front — no close without proof.`);
  } else {
    bullets.push(`Require GOTS / ISO certification before closing.`);
  }
  bullets.push(`Hold $${cap.toFixed(2)}/unit as a hard ceiling — pause and check in if exceeded.`);
  return bullets.slice(0, 4);
}

/** Always-valid plan derived purely from onboarding answers. */
export function buildFallbackPlan(answers: OnboardingAnswers): SourcingPlan {
  const regions = planRegions(answers);
  const suppliers = pickSuppliers(regions);
  const units = Math.max(1, answers.units || 500);
  const cap = round2(answers.budgetMax || answers.budgetMin || 5);
  const target = round2(
    Math.min(cap - 0.05, (answers.budgetMin || cap * 0.8) + 0.2),
  );
  const estSpend = Math.round(target * units);
  const estMinutes = Math.max(8, suppliers.length * 2);
  const product = productLabelOf(answers);
  const regionsText =
    regions.length === 1 ? regions[0] : regions.join(" & ");

  return {
    productLabel: product,
    summary: `I'll call ${suppliers.length} suppliers across ${regionsText} in the next ~${estMinutes} minutes, holding a $${cap.toFixed(
      2,
    )}/unit hard cap.`,
    regions,
    suppliers,
    estMinutes,
    budget: { targetUnit: target, capUnit: cap, units, estSpend },
    callStrategy: {
      mode: `${suppliers.length} calls in parallel`,
      order: `${regions[0]}${regions[1] ? ` → ${regions.slice(1).join(" → ")}` : ""}`,
    },
    negotiation: negotiationBullets(answers, target, cap),
    priorityLabel: PRIORITY_LABEL[answers.priority] ?? "Best overall",
  };
}

function recompute(plan: SourcingPlan): SourcingPlan {
  const regionsText =
    plan.regions.length === 1 ? plan.regions[0] : plan.regions.join(" & ");
  const estMinutes = Math.max(8, plan.suppliers.length * 2);
  return {
    ...plan,
    estMinutes,
    budget: {
      ...plan.budget,
      estSpend: Math.round(plan.budget.targetUnit * plan.budget.units),
    },
    callStrategy: {
      ...plan.callStrategy,
      mode: `${plan.suppliers.length} calls in parallel`,
    },
    summary: `I'll call ${plan.suppliers.length} suppliers across ${regionsText} in the next ~${estMinutes} minutes, holding a $${plan.budget.capUnit.toFixed(
      2,
    )}/unit hard cap.`,
  };
}

/**
 * Heuristic refinement — handles the quick-reply chips and obvious
 * free-form asks without a model round-trip. Returns the next plan
 * plus a short agent reply.
 */
export function refineFallback(
  plan: SourcingPlan,
  message: string,
): { plan: SourcingPlan; reply: string } {
  const m = message.toLowerCase();
  let next: SourcingPlan = { ...plan, budget: { ...plan.budget } };
  let reply = "";

  // Focus only on <region>
  const focus = plan.regions.find((r) => m.includes(r.toLowerCase()));
  if ((m.includes("focus") || m.includes("only")) && focus) {
    next.regions = [focus];
    next.suppliers = plan.suppliers.filter((s) => s.country === focus);
    if (next.suppliers.length === 0) next.suppliers = plan.suppliers.slice(0, 3);
    next = recompute(next);
    reply = `Done — narrowed to ${focus} only. Dropped the rest; ${next.suppliers.length} suppliers left. Updated plan above.`;
    return { plan: next, reply };
  }

  // Lower the price cap
  if ((m.includes("lower") || m.includes("reduce") || m.includes("drop")) && m.includes("cap")) {
    next.budget.capUnit = round2(Math.max(plan.budget.targetUnit + 0.1, plan.budget.capUnit - 0.25));
    next.budget.targetUnit = round2(Math.min(next.budget.targetUnit, next.budget.capUnit - 0.05));
    next.negotiation = negotiationBulletsFrom(plan, next.budget.targetUnit, next.budget.capUnit);
    next = recompute(next);
    reply = `Tightened the ceiling to $${next.budget.capUnit.toFixed(2)}/unit — I'll anchor harder to hit it. Updated plan above.`;
    return { plan: next, reply };
  }

  // Add more suppliers
  if (m.includes("add") && m.includes("supplier")) {
    const have = new Set(plan.suppliers.map((s) => s.name));
    const extra = pickSuppliers(plan.regions).filter((s) => !have.has(s.name));
    next.suppliers = [...plan.suppliers, ...extra].slice(0, 9);
    next = recompute(next);
    reply = `Added ${next.suppliers.length - plan.suppliers.length} more — ${next.suppliers.length} suppliers now. Updated plan above.`;
    return { plan: next, reply };
  }

  // Generic acknowledgement — no structural change.
  reply =
    "Noted. I've kept the structure but I'll lead with that in every call. Anything else before we start?";
  return { plan, reply };
}

// Re-derive bullets when the cap changes mid-refine.
function negotiationBulletsFrom(
  plan: SourcingPlan,
  target: number,
  cap: number,
): string[] {
  const anchor = round2(Math.max(0.5, target - 0.4));
  return [
    `Anchor at $${anchor.toFixed(2)}/unit and settle toward $${target.toFixed(2)}.`,
    `Ask for a bulk discount above 250 units.`,
    `Require GOTS / ISO certification before closing.`,
    `Hold $${cap.toFixed(2)}/unit as a hard ceiling — pause and check in if exceeded.`,
  ];
}
