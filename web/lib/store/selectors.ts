import type { AtlasState } from "./index";
import type { NegotiationCall, Supplier } from "@/lib/types";

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
