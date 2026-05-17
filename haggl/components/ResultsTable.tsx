import { useState, useMemo, useEffect, useCallback } from "react";

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
  totalCostMillicents?: number;
  rfqId: string;
  rfqStatus: string;
  onRefreshRfq?: () => void;
}

type SortKey = "rank" | "composite_score" | "price_score" | "lead_time_score" | "communication_score" | "reliability_score" | "supplier_name";

export default function ResultsTable({ suppliers, explanations, recommended, loading, error, totalCostMillicents, rfqId, rfqStatus, onRefreshRfq }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("composite_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const [paymentInfo, setPaymentInfo] = useState<any | null>(null);
  const [awardingId, setAwardingId] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const loadPaymentInfo = useCallback(async () => {
    try {
      setPaymentLoading(true);
      const res = await fetch(`/api/rfq/${rfqId}/payment`);
      if (res.ok) {
        const data = await res.json();
        setPaymentInfo(data);
      }
    } catch (err) {
      console.error("Failed to load payment info:", err);
    } finally {
      setPaymentLoading(false);
    }
  }, [rfqId]);

  useEffect(() => {
    if (rfqStatus === "awarded") {
      loadPaymentInfo();
    }
  }, [rfqStatus, loadPaymentInfo]);

  const handleAwardSupplier = async (supplierId: string) => {
    try {
      setAwardingId(supplierId);
      const res = await fetch(`/api/feedback?action=award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId,
          notes: "Awarded autonomously via HAGGL Results Hub"
        })
      });
      if (!res.ok) {
        throw new Error("Failed to award supplier");
      }
      onRefreshRfq?.();
      await loadPaymentInfo();
    } catch (err: any) {
      alert("Awarding failed: " + err.message);
    } finally {
      setAwardingId(null);
    }
  };

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
    
    // Sort logic respecting outcome priority
    const getOutcomeWeight = (s: ScoredSupplier) => {
      const outcome = s.extraction?.outcome;
      if (s.composite_score === 0 && s.extraction?.error) return 0; // failed/errored
      if (outcome === "declined") return 1;
      if (outcome === "follow_up_requested") return 2;
      return 3; // completed+quoted or default
    };

    return [...suppliers].sort((a, b) => {
      if (sortKey === "composite_score") {
        const weightA = getOutcomeWeight(a);
        const weightB = getOutcomeWeight(b);
        if (weightA !== weightB) {
          return sortDir === "desc" ? weightB - weightA : weightA - weightB;
        }
      }

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

  const summary = useMemo(() => {
    let quoted = 0;
    let declined = 0;
    let pending = 0;
    
    suppliers.forEach(s => {
      const outcome = s.extraction?.outcome;
      if (outcome === "declined") declined++;
      else if (outcome === "follow_up_requested" || !s.extraction || (s.composite_score === 0 && s.extraction?.error)) pending++;
      else quoted++;
    });

    return { quoted, declined, pending };
  }, [suppliers]);

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
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 flex justify-between items-center text-sm">
        <div className="flex gap-4">
          <span className="text-emerald-400 font-semibold">{summary.quoted} suppliers quoted</span>
          <span className="text-slate-500">|</span>
          <span className="text-red-400">{summary.declined} declined</span>
          <span className="text-slate-500">|</span>
          <span className="text-amber-400">{summary.pending} pending/failed</span>
          {totalCostMillicents != null && (
            <>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400 font-mono">Total RFQ Cost: ${(totalCostMillicents / 100_000).toFixed(2)}</span>
            </>
          )}
        </div>
      </div>

      {rfqStatus === "awarded" && paymentInfo?.awarded && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-indigo-950/30 to-slate-900/40 border border-emerald-500/30 rounded-lg p-5 space-y-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-bounce">🏆</span>
            <div>
              <h3 className="text-base font-bold text-slate-100">Deal Awarded & Transactions Dispatched</h3>
              <p className="text-xs text-slate-400">HAGGL Autonomous Sponsor Payments & Fallbacks have executed successfully.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1.5">
            {/* Sponge Wallet Status */}
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">🧽 Sponge Autonomous Wallet</span>
                <p className="text-[11px] text-slate-300 mt-1">Direct B2B wallet transfer processed via Paysponge wallet endpoint.</p>
              </div>
              <div className="mt-3.5 pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500">ID: {paymentInfo.payment_id ? paymentInfo.payment_id.slice(0, 15) + "..." : "N/A"}</span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-500/20">
                  {paymentInfo.status}
                </span>
              </div>
            </div>

            {/* Stripe Fallback Link */}
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">💳 Stripe Fallback Checkout</span>
                <p className="text-[11px] text-slate-300 mt-1">If corporate wallet transfers fail, proceed with direct credit/debit checkout.</p>
              </div>
              <div className="mt-3.5">
                {paymentInfo.payment_link ? (
                  <a
                    href={paymentInfo.payment_link}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full text-center py-1.5 px-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-[10px] font-bold uppercase rounded shadow-lg text-white block transition-all hover:scale-[1.02]"
                  >
                    🔗 Launch Stripe Link
                  </a>
                ) : (
                  <span className="text-[10px] text-slate-500 italic block text-center">Stripe Fallback not generated</span>
                )}
              </div>
            </div>

            {/* Business KPI - Cost Savings */}
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-pink-400 tracking-wider">📈 HAGGL Cost Savings KPI</span>
                <p className="text-[11px] text-slate-300 mt-1">Net value preserved relative to your target procurement price.</p>
              </div>
              <div className="mt-3.5 pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Tracked in Stripe Events</span>
                <span className="text-sm font-bold font-mono text-pink-400">
                  +${(paymentInfo.savings_tracked || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {paymentInfo.trade_documents && (
            <div className="mt-4 pt-4 border-t border-emerald-500/20 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-cyan-400 font-bold text-xs uppercase tracking-wider">📄 Trade Forms completed via Browser Use</span>
                {paymentInfo.trade_documents.hsCode && (
                  <span className="text-[10px] bg-cyan-950/40 text-cyan-400 border border-cyan-800/30 px-2 py-0.5 rounded font-mono shadow-sm">
                    HS Code: {paymentInfo.trade_documents.hsCode}
                  </span>
                )}
                {paymentInfo.trade_documents.estimatedDuty && (
                  <span className="text-[10px] bg-pink-950/40 text-pink-400 border border-pink-800/30 px-2 py-0.5 rounded font-mono shadow-sm">
                    Est. Duty: {paymentInfo.trade_documents.estimatedDuty}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {paymentInfo.trade_documents.formsCompleted?.map((form: string, idx: number) => {
                  const url = paymentInfo.trade_documents.documentsUrl?.[idx];
                  return (
                    <div key={idx} className="bg-slate-900/60 border border-slate-700/40 rounded px-3 py-2 flex items-center justify-between gap-4 text-[11px] shadow-sm hover:border-slate-600 transition-colors">
                      <span className="text-slate-300 font-medium">{form}</span>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 font-bold uppercase text-[9px] tracking-wider transition-colors"
                        >
                          View ↗
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
                <tr key={s.supplier_id} className={`transition-colors ${isRec ? "bg-emerald-900/10" : s.extraction?.outcome === "declined" ? "bg-red-900/10" : "hover:bg-slate-700/20"} ${isExpanded ? "bg-slate-700/20" : ""}`}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {isRec && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 font-semibold">★</span>}
                      {s.extraction?.outcome === "declined" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 font-semibold border border-red-500/30">Declined</span>}
                      {s.extraction?.outcome === "follow_up_requested" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 font-semibold border border-amber-500/30">Follow-up needed</span>}
                      <span className={`font-mono text-xs ${isRec ? "text-emerald-300" : "text-slate-400"}`}>#{expl?.rank || i + 1}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-sm font-medium ${isRec ? "text-emerald-200" : s.extraction?.outcome === "declined" ? "text-red-300" : "text-slate-200"}`}>
                      {s.supplier_name}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {s.composite_score === 0 && s.extraction?.error ? (
                      <div className="group relative inline-block">
                        <span className="text-xs font-semibold px-2 py-1 rounded bg-red-900/40 text-red-400 border border-red-500/30">Extraction failed</span>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-900 border border-slate-700 rounded text-[10px] text-slate-300 z-10 shadow-xl">
                          {s.extraction.error}
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className={`text-sm font-bold font-mono ${s.composite_score >= 70 ? "text-emerald-400" : s.composite_score >= 50 ? "text-cyan-400" : "text-slate-400"}`}>
                          {s.composite_score}
                        </span>
                        {scoreBar(s.composite_score)}
                      </>
                    )}
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
                <div className="flex flex-wrap gap-4 text-slate-400 mt-2 p-2 bg-slate-900/30 rounded border border-slate-700/50">
                  <span>Quoted: {s.extraction?.quoted_price != null ? <span className="text-emerald-400 font-mono">${s.extraction.quoted_price.toLocaleString()}</span> : <span className="text-slate-500 italic">No quote obtained</span>}</span>
                  <span>Lead: {s.extraction?.lead_time_days != null ? <span className="text-cyan-400">{s.extraction.lead_time_days}d</span> : "—"}</span>
                  <span>Comm. Quality: {s.extraction?.communication_quality != null ? <span className="text-cyan-400">{s.extraction.communication_quality}/10</span> : "—"}</span>
                  <span>Effectiveness: {s.extraction?.negotiation_effectiveness != null ? <span className="text-cyan-400">{s.extraction.negotiation_effectiveness}/10</span> : "—"}</span>
                  {s.extraction?.payment_terms && <span>Terms: <span className="text-slate-300">{s.extraction.payment_terms}</span></span>}
                  <span>Certs: {s.extraction?.certifications && s.extraction.certifications.length > 0 ? <span className="text-slate-300">{s.extraction.certifications.join(", ")}</span> : <span className="text-slate-500 italic">None disclosed</span>}</span>
                  {s.extraction?.call_cost_millicents != null && <span>Call Cost: <span className="text-slate-300 font-mono">${(s.extraction.call_cost_millicents / 100_000).toFixed(2)}</span></span>}
                  {s.extraction?.duration_seconds != null && <span>Duration: <span className="text-slate-300 font-mono">{s.extraction.duration_seconds}s</span></span>}
                </div>

                <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-800">
                  <div className="text-[10px] text-slate-500">
                    {rfqStatus === "awarded" ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        🏆 Deal Awarded & Fully Dispatched
                      </span>
                    ) : (
                      "Awarding this supplier initiates autonomous Paysponge wallet routing & Stripe card fallbacks."
                    )}
                  </div>
                  {rfqStatus !== "awarded" && s.extraction?.quoted_price != null && (
                    <button
                      onClick={() => handleAwardSupplier(s.supplier_id)}
                      disabled={awardingId != null}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white rounded text-[10px] font-bold uppercase transition-all shadow-md flex items-center gap-1.5 hover:scale-[1.02]"
                    >
                      {awardingId === s.supplier_id ? (
                        <>
                          <div className="w-2.5 h-2.5 border border-white/30 border-t-white rounded-full animate-spin" />
                          Processing Award...
                        </>
                      ) : (
                        "Award Deal"
                      )}
                    </button>
                  )}
                </div>
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
    </div>
  );
}
