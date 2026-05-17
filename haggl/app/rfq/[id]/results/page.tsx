"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import ResultsTable from "@/components/ResultsTable";

export default function ResultsPage() {
  const { id: rfqId } = useParams<{ id: string }>();
  const [results, setResults] = useState<any>(null);
  const [rfqStatus, setRfqStatus] = useState<string>("negotiating");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    try {
      const [resultsRes, rfqRes] = await Promise.all([
        fetch(`/api/rfq/${rfqId}/results`),
        fetch(`/api/rfq/${rfqId}`),
      ]);
      if (!resultsRes.ok) throw new Error(resultsRes.statusText || "Failed to load results");
      const data = await resultsRes.json();
      if (data?.error) throw new Error(data.error);
      setResults(data);
      if (rfqRes.ok) {
        const rfq = await rfqRes.json();
        if (rfq?.status) setRfqStatus(rfq.status);
      }
      setLoading(false);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }, [rfqId]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  if (loading)
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <p className="text-slate-400 font-mono text-sm">Extracting negotiation data…</p>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <p className="text-red-400 font-mono text-sm">Error: {error}</p>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <h1 className="text-xl font-bold mb-2 font-mono">Negotiation Results</h1>
      <p className="text-slate-500 text-sm font-mono mb-6">{results?.rfq_title}</p>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {(
          [
            ["Suppliers Called", results?.total_calls],
            ["Responded", results?.successful_calls],
            ["Best Price", results?.best_price != null ? `$${Number(results.best_price).toFixed(2)}` : "—"],
            ["Best Supplier", results?.best_price_supplier || "—"],
          ] as [string, any][]
        ).map(([label, val]) => (
          <div key={label} className="border border-slate-800 rounded p-3 font-mono">
            <p className="text-xs text-slate-500 uppercase">{label}</p>
            <p className="text-lg font-bold mt-1">{val ?? "—"}</p>
          </div>
        ))}
      </div>

      {results && (
        <ResultsTable
          suppliers={results.ranked_suppliers || []}
          explanations={results.explanations || []}
          recommended={results.recommended_supplier || null}
          totalCostMillicents={results.total_cost_millicents}
          rfqId={rfqId}
          rfqStatus={rfqStatus}
          onRefreshRfq={loadResults}
        />
      )}
    </div>
  );
}
