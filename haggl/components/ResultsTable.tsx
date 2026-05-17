"use client";

import { useState, useMemo } from "react";

interface ScoredSupplier {
  supplier_id: string;
  supplier_name: string;
  price_score: number;
  lead_time_score: number;
  communication_score: number;
  reliability_score: number;
  composite_score: number;
  breakdown: Record<string, number>;
  extraction: any;
}

interface Explanation {
  supplier_id: string;
  supplier_name: string;
  composite_score: number;
  rank: number;
  is_recommended: boolean;
  explanation: string;
}

interface Props {
  suppliers: ScoredSupplier[];
  explanations: Explanation[];
  recommended?: Explanation | null;
  loading?: boolean;
  error?: string | null;
}

type SortKey = "rank" | "composite_score" | "price_score" | "lead_time_score" | "communication_score" | "reliability_score" | "supplier_name";

export default function ResultsTable({ suppliers, explanations, recommended, loading, error }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("composite_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "supplier_name" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    if (!suppliers) return [];
    return [...suppliers].sort((a, b) => {
      const valA = sortKey === "rank"
        ? explanations.find((e) => e.supplier_id === a.supplier_id)?.rank || 999
        : sortKey === "supplier_name" ? a.supplier_name : a[sortKey];
      const valB = sortKey === "rank"
        ? explanations.find((e) => e.supplier_id === b.supplier_id)?.rank || 999
        : sortKey === "supplier_name" ? b.supplier_name : b[sortKey];
      if (typeof valA === "string") {
        return sortDir === "asc" ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
      }
      return sortDir === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [suppliers, sortKey, sortDir, explanations]);

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="px-3 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-200 select-none whitespace-nowrap" onClick={() => handleSort(k)}>
      <div className="flex items-center gap-1">
        {label}
        {sortKey === k && (
          <span className="text-cyan-400">{sortDir === "desc" ? "▼" : "▲"}</span>
        )}
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-12">
        <div className="flex items-center justify-center gap-3 text-slate-400">
          <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <span className="text-sm">Scoring suppliers...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/10 rounded-lg border border-red-500/20 p-6">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!suppliers || suppliers.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-12">
        <p className="text-center text-sm text-slate-500">No completed calls to rank</p>
      </div>
    );
  }

  const scoreBar = (score: number) => {
    const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-cyan-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
    return (
      <div className="w-full bg-slate-700/50 rounded-full h-1.5 mt-1">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    );
  };

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <SortHeader label="Rank" k="rank" />
              <SortHeader label="Supplier" k="supplier_name" />
              <SortHeader label="Composite" k="composite_score" />
              <SortHeader label="Price" k="price_score" />
              <SortHeader label="Lead Time" k="lead_time_score" />
              <SortHeader label="Comm." k="communication_score" />
              <SortHeader label="Reliability" k="reliability_score" />
              <th className="px-3 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {sorted.map((s, i) => {
              const expl = explanations.find((e) => e.supplier_id === s.supplier_id);
              const isExpanded = expandedRow === s.supplier_id;
              const isRec = expl?.is_recommended;
              return (
                <tr key={s.supplier_id} className={`transition-colors ${isRec ? "bg-emerald-900/10" : "hover:bg-slate-700/20"} ${isExpanded ? "bg-slate-700/20" : ""}`}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {isRec && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 font-semibold">★</span>}
                      <span className={`font-mono text-xs ${isRec ? "text-emerald-300" : "text-slate-400"}`}>#{expl?.rank || i + 1}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-sm font-medium ${isRec ? "text-emerald-200" : "text-slate-200"}`}>
                      {s.supplier_name}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-sm font-bold font-mono ${s.composite_score >= 70 ? "text-emerald-400" : s.composite_score >= 50 ? "text-cyan-400" : "text-slate-400"}`}>
                      {s.composite_score}
                    </span>
                    {scoreBar(s.composite_score)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-slate-300">{s.price_score}</span>
                    {scoreBar(s.price_score)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-slate-300">{s.lead_time_score}</span>
                    {scoreBar(s.lead_time_score)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-slate-300">{s.communication_score}</span>
                    {scoreBar(s.communication_score)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-slate-300">{s.reliability_score}</span>
                    {scoreBar(s.reliability_score)}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => setExpandedRow(isExpanded ? null : s.supplier_id)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      {isExpanded ? "Hide" : "View"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedRow && (
        <div className="border-t border-slate-700/50 p-4 bg-slate-900/50">
          {(() => {
            const s = suppliers.find((x) => x.supplier_id === expandedRow);
            const expl = explanations.find((e) => e.supplier_id === expandedRow);
            if (!s) return null;
            return (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Explanation:</span>
                  <span className="text-slate-200">{expl?.explanation || "No explanation available"}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(s.breakdown || {}).map(([k, v]) => (
                    <div key={k} className="bg-slate-800/50 rounded p-2">
                      <p className="text-[10px] text-slate-500 mb-0.5">{k.replace(/_/g, " ")}</p>
                      <p className="text-xs font-mono text-slate-300">{v}</p>
                    </div>
                  ))}
                </div>
                {s.extraction?.quoted_price != null && (
                  <div className="flex gap-4 text-slate-400">
                    <span>Quoted: <span className="text-emerald-400 font-mono">${s.extraction.quoted_price.toLocaleString()}</span></span>
                    {s.extraction.lead_time_days && <span>Lead: <span className="text-cyan-400">{s.extraction.lead_time_days}d</span></span>}
                    {s.extraction.payment_terms && <span>Terms: <span className="text-slate-300">{s.extraction.payment_terms}</span></span>}
                    {s.extraction.certifications?.length > 0 && <span>Certs: <span className="text-slate-300">{s.extraction.certifications.join(", ")}</span></span>}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {recommended && (
        <div className="border-t border-emerald-500/20 px-4 py-3 bg-emerald-900/5">
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 text-sm mt-0.5">★</span>
            <div>
              <p className="text-xs font-semibold text-emerald-300">Recommended: {recommended.supplier_name}</p>
              <p className="text-[11px] text-emerald-400/70 mt-0.5">{recommended.explanation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
