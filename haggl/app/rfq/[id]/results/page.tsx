"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ResultsTable from "@/components/ResultsTable";

interface ResultsData {
  rfq_id: string;
  rfq_title: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  suppliers_contacted: number;
  suppliers_responded: number;
  best_price: number | null;
  best_price_supplier: string | null;
  best_price_supplier_id: string | null;
  average_quoted_price: number | null;
  total_cost_millicents?: number;
  ranked_suppliers: any[];
  explanations: any[];
  recommended_supplier: any | null;
  weights_used: Record<string, number>;
  target_price: number | null;
  floor_price: number | null;
  message?: string;
  created_at: string;
}

interface RfqMeta {
  id: string;
  title: string;
  status: string;
  target_price: number | null;
  items: any[];
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-slate-800 rounded w-1/3" />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-800/50 rounded-lg" />)}
      </div>
      <div className="h-64 bg-slate-800/50 rounded-lg" />
    </div>
  );
}

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [rfq, setRfq] = useState<RfqMeta | null>(null);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      const [metaRes, resultsRes] = await Promise.all([
        fetch(`/api/rfq/${id}`),
        fetch(`/api/rfq/${id}/results`),
      ]);
      if (!metaRes.ok) throw new Error("RFQ not found");
      const meta = await metaRes.json();
      const data: ResultsData = await resultsRes.json();
      setRfq(meta);
      setResults(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  if (loading) return <LoadingSkeleton />;
  if (error) return (
    <div className="flex flex-col items-center justify-center py-16">
      <p className="text-sm text-red-400 mb-3">{error}</p>
      <button onClick={() => router.push("/rfqs")} className="text-xs text-cyan-400 hover:text-cyan-300">← Back to RFQs</button>
    </div>
  );

  const isReady = results && results.successful_calls > 0 && results.ranked_suppliers?.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-100">{results?.rfq_title || "Results"}</h1>
            {rfq && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                rfq.status === "closed" || rfq.status === "awarded" ? "border-emerald-500/30 text-emerald-300 bg-emerald-900/10" :
                rfq.status === "negotiating" ? "border-amber-500/30 text-amber-300 bg-amber-900/10" :
                "border-slate-600/50 text-slate-400"
              }`}>{rfq.status}</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">Aggregated results and supplier rankings</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push(`/rfq/${id}/monitor`)} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border border-slate-700 hover:border-slate-500 text-slate-300 rounded-lg transition-all">
            Monitor
          </button>
          <button onClick={fetchResults} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-all">
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatBox label="Total Calls" value={results?.total_calls || 0} />
        <StatBox label="Successful" value={results?.successful_calls || 0} color="text-emerald-400" />
        <StatBox label="Suppliers" value={results?.suppliers_responded || 0} />
        <StatBox label="Avg. Price" value={results?.average_quoted_price != null ? `$${results.average_quoted_price.toLocaleString()}` : "—"} />
        <StatBox label="AI & Telecom Cost" value={results?.total_cost_millicents != null ? `$${(results.total_cost_millicents / 100_000).toFixed(2)}` : "—"} color="text-slate-400" />
      </div>

      {!isReady ? (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-500">{results?.message || "No completed calls to analyze yet"}</p>
          <p className="text-xs text-slate-600 mt-2">Run dispatch and wait for calls to complete</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Best Price</p>
              <p className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                {results.best_price != null ? `$${results.best_price.toLocaleString()}` : "—"}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">{results.best_price_supplier || ""}</p>
            </div>
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Target Price</p>
              <p className="text-sm font-bold font-mono text-slate-300 mt-0.5">
                {results.target_price != null ? `$${results.target_price.toLocaleString()}` : "—"}
              </p>
            </div>
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Floor Price</p>
              <p className="text-sm font-bold font-mono text-slate-300 mt-0.5">
                {results.floor_price != null ? `$${results.floor_price.toLocaleString()}` : "—"}
              </p>
            </div>
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Avg. Quoted</p>
              <p className="text-sm font-bold font-mono text-cyan-400 mt-0.5">
                {results.average_quoted_price != null ? `$${results.average_quoted_price.toLocaleString()}` : "—"}
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-slate-900/60 via-indigo-950/20 to-slate-900/60 border border-indigo-500/20 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm">📬</span>
              <div>
                <p className="text-xs font-bold text-slate-200">AgentMail Intelligent Notifications Dispatched</p>
                <p className="text-[10px] text-slate-500">Auto-generated rich summaries sent to active suppliers & primary buyer inbox.</p>
              </div>
            </div>
            <div className="text-[9px] font-mono uppercase bg-indigo-950/40 border border-indigo-500/30 px-2 py-0.5 rounded text-indigo-300">
              Dispatched: {results.created_at ? new Date(results.created_at).toLocaleTimeString() : new Date().toLocaleTimeString()}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Supplier Rankings</h2>
              <span className="text-[10px] text-slate-600 font-mono">
                {results.ranked_suppliers.length} supplier(s) ranked
              </span>
            </div>
            <ResultsTable
              suppliers={results.ranked_suppliers}
              explanations={results.explanations}
              recommended={results.recommended_supplier}
              totalCostMillicents={results.total_cost_millicents}
              rfqId={id}
              rfqStatus={rfq?.status || ""}
              onRefreshRfq={fetchResults}
            />
          </div>

          <div className="text-[10px] text-slate-600 font-mono text-right">
            Weights: {Object.entries(results.weights_used || {}).map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`).join(" · ")}
          </div>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold font-mono mt-0.5 ${color || "text-slate-200"}`}>{value}</p>
    </div>
  );
}
