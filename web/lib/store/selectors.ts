import type { AtlasState } from "./index";
import type { NegotiationCall, Supplier, ResearchRun } from "@/lib/types";

export interface Kpis {
  placed: number;
  inProgress: number;
  completed: number;
  dealsReached: number;
}

export interface BestOffer {
  callId: string;
  supplierName: string;
  city: string;
  region: string;
  unitPrice: number;
  units: number;
  leadDays: number | null;
  totalSaved: number;
}

export interface RegionRow {
  region: string;
  language: string;
  calls: number;
  deals: number;
  ratio: number;
}

export interface DonutBreakdown {
  reached: number;
  declined: number;
  pending: number;
}

export interface LedgerRow {
  callId: string;
  supplierName: string;
  city: string;
  region: string;
  language: string;
  status: NegotiationCall["status"];
  phase: NegotiationCall["phase"];
  unitPrice: number | null;
  leadDays: number | null;
  isBest: boolean;
}

const ACTIVE: NegotiationCall["status"][] = ["ringing", "in-progress", "queued"];
const DEAL: NegotiationCall["status"][] = ["completed"];

function supplierMeta(s: Supplier | undefined) {
  const m = (s?.metadata ?? {}) as Record<string, string>;
  return {
    region: m.region ?? "—",
    city: m.city ?? "—",
    language: m.language ?? "English",
  };
}

function leadDaysOf(call: NegotiationCall): number | null {
  const t = call.result?.delivery_timeline;
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Reference-stable selector memoization (reselect-style).
 *
 * Selectors that build new arrays/objects break `useShallow`, which only
 * compares one level deep — fresh inner object refs make every comparison
 * fail, producing an unstable getSnapshot and a React infinite loop.
 * `memo` returns the *same* result reference until one of the tracked
 * dependency refs changes.
 */
function memo<R>(
  deps: (s: AtlasState) => readonly unknown[],
  compute: (s: AtlasState) => R,
): (s: AtlasState) => R {
  let prev: readonly unknown[] | undefined;
  let value: R;
  return (s) => {
    const next = deps(s);
    if (
      prev !== undefined &&
      prev.length === next.length &&
      prev.every((d, i) => Object.is(d, next[i]))
    ) {
      return value;
    }
    prev = next;
    value = compute(s);
    return value;
  };
}

export const selectKpis = (s: AtlasState): Kpis => {
  const calls = Object.values(s.calls);
  return {
    placed: s.callingStarted ? calls.length : 0,
    inProgress: calls.filter((c) => ACTIVE.includes(c.status)).length,
    completed: calls.filter(
      (c) => c.status === "completed" || c.status === "capped",
    ).length,
    dealsReached: calls.filter(
      (c) => c.status === "completed" && c.result?.quoted_price != null,
    ).length,
  };
};

export const selectBestOffer = (s: AtlasState): BestOffer | null => {
  let best: BestOffer | null = null;
  for (const call of Object.values(s.calls)) {
    const price = call.result?.quoted_price;
    if (call.status !== "completed" || price == null) continue;
    const sup = s.suppliers[call.supplier_id];
    const meta = supplierMeta(sup);
    const units = s.rfq?.items[0]?.quantity ?? 0;
    const cap = s.rfq?.items[0]?.target_unit_price ?? 0;
    if (!best || price < best.unitPrice) {
      best = {
        callId: call.id,
        supplierName: sup?.name ?? "Unknown",
        city: meta.city,
        region: meta.region,
        unitPrice: price,
        units,
        leadDays: leadDaysOf(call),
        totalSaved: Math.max(0, (cap - price) * units),
      };
    }
  }
  return best;
};

export const selectRegionRows = memo(
  (s) => [s.calls, s.suppliers, s.callingStarted],
  (s: AtlasState): RegionRow[] => {
  const groups = new Map<string, RegionRow>();
  for (const call of Object.values(s.calls)) {
    if (!s.callingStarted) break;
    const meta = supplierMeta(s.suppliers[call.supplier_id]);
    const key = `${meta.region}·${meta.language}`;
    const row =
      groups.get(key) ??
      { region: meta.region, language: meta.language, calls: 0, deals: 0, ratio: 0 };
    row.calls += 1;
    if (call.status === "completed" && call.result?.quoted_price != null)
      row.deals += 1;
    groups.set(key, row);
  }
  const rows = [...groups.values()];
  const max = Math.max(1, ...rows.map((r) => r.calls));
  return rows
    .map((r) => ({ ...r, ratio: r.calls / max }))
    .sort((a, b) => b.calls - a.calls);
  },
);

export const selectDonut = (s: AtlasState): DonutBreakdown => {
  const calls = Object.values(s.calls);
  return {
    reached: calls.filter(
      (c) => c.status === "completed" && c.result?.quoted_price != null,
    ).length,
    declined: calls.filter(
      (c) =>
        c.status === "capped" ||
        (c.status === "completed" && c.result?.quoted_price == null),
    ).length,
    pending: calls.filter(
      (c) => ACTIVE.includes(c.status) || c.status === "pending",
    ).length,
  };
};

export const selectActiveCall = (s: AtlasState): {
  supplierName: string;
  language: string;
} | null => {
  const active = Object.values(s.calls).find(
    (c) => c.status === "in-progress" || c.status === "ringing",
  );
  if (!active) return null;
  const sup = s.suppliers[active.supplier_id];
  return { supplierName: sup?.name ?? "—", language: supplierMeta(sup).language };
};

export const selectLedgerRows = memo(
  (s) => [s.calls, s.callOrder, s.suppliers, s.rfq],
  (s: AtlasState): LedgerRow[] => {
  const best = selectBestOffer(s);
  return s.callOrder
    .map((id) => s.calls[id])
    .filter(Boolean)
    .map((call) => {
      const sup = s.suppliers[call.supplier_id];
      const meta = supplierMeta(sup);
      return {
        callId: call.id,
        supplierName: sup?.name ?? "Unknown",
        city: meta.city,
        region: meta.region,
        language: meta.language,
        status: call.status,
        phase: call.phase,
        unitPrice: call.result?.quoted_price ?? null,
        leadDays: leadDaysOf(call),
        isBest: best?.callId === call.id,
      };
    })
    .sort((a, b) => {
      const pa = a.unitPrice ?? Number.POSITIVE_INFINITY;
      const pb = b.unitPrice ?? Number.POSITIVE_INFINITY;
      return pa - pb;
    });
  },
);

/* ── Run registry summaries (Home + Research lists + sidebar badge) ── */

export interface RunSummary {
  id: string;
  title: string;
  isDemo: boolean;
  createdAt: string;
  status: "researching" | "ready" | "calling" | "complete" | "error";
  message: string | null;
  dossierCount: number;
  callsTotal: number;
  callsDone: number;
  dealsReached: number;
  /** Deals whose call closed on the current calendar day. */
  dealsToday: number;
  bestPrice: number | null;
  regionLabel: string;
}

const TERMINAL = new Set<NegotiationCall["status"]>([
  "completed",
  "capped",
  "failed",
  "no-answer",
  "busy",
  "rejected",
  "timeout",
]);

function summarizeRun(r: ResearchRun): RunSummary {
  const calls = Object.values(r.calls);
  const terminal = calls.filter((c) => TERMINAL.has(c.status));
  const deals = calls.filter(
    (c) => c.status === "completed" && c.result?.quoted_price != null,
  );
  let best: number | null = null;
  for (const c of deals) {
    const p = c.result?.quoted_price;
    if (p != null && (best == null || p < best)) best = p;
  }

  const today = new Date().toDateString();
  const dealsToday = deals.filter((c) => {
    const t = c.ended_at ?? c.updated_at;
    return !!t && new Date(t).toDateString() === today;
  }).length;

  let status: RunSummary["status"];
  if (r.research.status === "running") status = "researching";
  else if (r.research.status === "error" && !r.callingStarted) status = "error";
  else if (r.callingStarted)
    status =
      calls.length > 0 && terminal.length === calls.length
        ? "complete"
        : "calling";
  else status = "ready";

  const regions = new Set<string>();
  for (const sup of Object.values(r.suppliers)) {
    const region = (sup.metadata as Record<string, string>)?.region;
    if (region && region !== "—") regions.add(region);
  }
  const regionLabel =
    r.plan?.regions?.join(" & ") || [...regions].join(" & ") || "—";

  return {
    id: r.id,
    title: r.title,
    isDemo: !!r.isDemo,
    createdAt: r.createdAt,
    status,
    message: r.research.message,
    dossierCount: r.research.companies.length,
    callsTotal: r.callOrder.length,
    callsDone: terminal.length,
    dealsReached: deals.length,
    dealsToday,
    bestPrice: best,
    regionLabel,
  };
}

/** The active run rebuilt from the live working fields, so summaries
 *  reflect in-flight research/calls without a snapshot round-trip. */
function liveRun(s: AtlasState): ResearchRun | null {
  const id = s.activeRunId;
  const base = id ? s.runs[id] : undefined;
  if (!id || !base) return null;
  return {
    ...base,
    plan: s.plan,
    research: {
      status: s.researchStatus,
      message: s.researchMessage,
      companies: s.researchedCompanies,
    },
    rfq: s.rfq,
    suppliers: s.suppliers,
    calls: s.calls,
    callOrder: s.callOrder,
    callingStarted: s.callingStarted,
    campaignStartedAt: s.campaignStartedAt,
    elapsedSeconds: s.elapsedSeconds,
    totalCostUsd: s.totalCostUsd,
    isPausedAll: s.isPausedAll,
  };
}

export const selectRunList = memo(
  (s) => [
    s.runs,
    s.runOrder,
    s.activeRunId,
    s.calls,
    s.callingStarted,
    s.researchStatus,
    s.researchMessage,
    s.researchedCompanies,
    s.plan,
  ],
  (s: AtlasState): RunSummary[] =>
    s.runOrder
      .map((id) => (id === s.activeRunId ? liveRun(s) : s.runs[id]))
      .filter((r): r is ResearchRun => !!r)
      .map(summarizeRun),
);

/** Count of runs actively researching or calling — sidebar badge. */
export const selectActiveRunCount = (s: AtlasState): number =>
  selectRunList(s).filter(
    (r) => r.status === "researching" || r.status === "calling",
  ).length;
