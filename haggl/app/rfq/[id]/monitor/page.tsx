"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import CallCard from "@/components/CallCard";
import LiveTranscriptPanel from "@/components/LiveTranscriptPanel";
import ReasoningTracePanel from "@/components/ReasoningTracePanel";
import SupplierHistoryPanel from "@/components/SupplierHistoryPanel";

interface CallData {
  id: string;
  supplier_id: string;
  supplier_name: string | undefined;
  status: string;
  phase: string;
  duration_seconds: number | null;
  error_message: string | null;
  quoted_price: number | null | undefined;
}

interface RfqData {
  id: string;
  title: string;
  description: string;
  status: string;
  target_price: number | null;
  suppliers?: { id: string; supplier_id: string; status: string; supplier?: { name: string } | null }[];
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-slate-800 rounded w-1/3" />
      <div className="h-3 bg-slate-800 rounded w-1/2" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2 h-96 bg-slate-800/50 rounded-lg" />
        <div className="h-96 bg-slate-800/50 rounded-lg" />
      </div>
    </div>
  );
}

export default function MonitorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { socket, connected } = useSocket();

  const [rfq, setRfq] = useState<RfqData | null>(null);
  const [calls, setCalls] = useState<CallData[]>([]);
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [rfqRes, callsRes] = await Promise.all([
        fetch(`/api/rfq/${id}`),
        fetch(`/api/calls?rfq_id=${id}`),
      ]);
      if (!rfqRes.ok) throw new Error("RFQ not found");
      const rfqData = await rfqRes.json();
      const callsData: CallData[] = await callsRes.json();
      setRfq(rfqData);

      const enriched = callsData.map((c) => {
        const rel = rfqData.suppliers?.find((s: any) => s.supplier_id === c.supplier_id);
        return { ...c, supplier_name: c.supplier_name || rel?.supplier?.name || c.supplier_id.slice(0, 8) };
      });
      setCalls(enriched);

      if (!selectedCall && enriched.length > 0) {
        const active = enriched.find((c) => c.status === "in_progress" || c.status === "ringing");
        setSelectedCall(active?.id || enriched[0].id);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id, selectedCall]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    
    const handleCallStatus = (data: any) => {
      setCalls(prev => prev.map(c => c.id === data.callId ? { ...c, status: data.status } : c));
    };
    
    socket.on('call_status_changed', handleCallStatus);
    
    return () => {
      socket.off('call_status_changed', handleCallStatus);
    };
  }, [socket]);

  const handleDispatch = async () => {
    setDispatching(true);
    setError(null);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfq_id: id }),
      });
      if (!res.ok) throw new Error("Dispatch failed");
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Dispatch failed");
    } finally {
      setDispatching(false);
    }
  };

  const handleCancel = async () => {
    try {
      await fetch(`/api/dispatch`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfq_id: id }),
      });
      await fetchData();
    } catch {}
  };

  if (loading) return <LoadingSkeleton />;
  if (error && !rfq) return (
    <div className="flex flex-col items-center justify-center py-16">
      <p className="text-sm text-red-400 mb-3">{error}</p>
      <button onClick={() => router.push("/rfqs")} className="text-xs text-cyan-400 hover:text-cyan-300">← Back to RFQs</button>
    </div>
  );

  const activeCalls = calls.filter((c) => c.status === "in_progress" || c.status === "ringing");
  const completedCalls = calls.filter((c) => c.status === "completed");
  const failedCalls = calls.filter((c) => c.status === "failed" || c.error_message);
  const pendingCalls = calls.filter((c) => c.status === "pending" || c.status === "queued");

  const canDispatch = rfq?.status === "open" || rfq?.status === "draft";

  const selectedCallData = calls.find((c) => c.id === selectedCall);
  const selectedSupplierId = selectedCallData?.supplier_id;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-100">{rfq?.title || "RFQ Monitor"}</h1>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              rfq?.status === "negotiating" ? "border-amber-500/30 text-amber-300 bg-amber-900/10" :
              rfq?.status === "closed" || rfq?.status === "awarded" ? "border-emerald-500/30 text-emerald-300 bg-emerald-900/10" :
              "border-slate-600/50 text-slate-400 bg-slate-800/30"
            }`}>{rfq?.status}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{rfq?.description?.slice(0, 120)}</p>
        </div>
        <div className="flex items-center gap-2">
          {canDispatch && (
            <button
              onClick={handleDispatch}
              disabled={dispatching}
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {dispatching ? (
                <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Dispatching</>
              ) : (
                "Dispatch Calls"
              )}
            </button>
          )}
          <button
            onClick={() => router.push(`/rfq/${id}/results`)}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border border-slate-700 hover:border-slate-500 text-slate-300 rounded-lg transition-all"
          >
            Results
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <StatBox label="Active Calls" value={activeCalls.length} color="text-cyan-400" />
        <StatBox label="Completed" value={completedCalls.length} color="text-emerald-400" />
        <StatBox label="Failed" value={failedCalls.length} color="text-red-400" />
        <StatBox label="Pending" value={pendingCalls.length} color="text-slate-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <LiveTranscriptPanel
            callId={selectedCall || ""}
            height="h-80"
          />

          <ReasoningTracePanel callId={selectedCall || undefined} />

          <SupplierHistoryPanel supplierId={selectedSupplierId} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Calls ({calls.length})
            </h2>
            {connected && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {calls.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-600 italic">
                {canDispatch ? "No calls yet. Dispatch to begin." : "No calls recorded"}
              </div>
            )}

            {activeCalls.length > 0 && (
              <>
                <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">In Progress</p>
                {activeCalls.map((c) => (
                  <CallCard key={c.id} call={c} onSelect={setSelectedCall} compact />
                ))}
              </>
            )}

            {pendingCalls.length > 0 && (
              <>
                <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider pt-2">Queued</p>
                {pendingCalls.map((c) => (
                  <CallCard key={c.id} call={c} onSelect={setSelectedCall} compact />
                ))}
              </>
            )}

            {completedCalls.length > 0 && (
              <>
                <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider pt-2">Completed</p>
                {completedCalls.map((c) => (
                  <CallCard key={c.id} call={c} onSelect={setSelectedCall} compact />
                ))}
              </>
            )}

            {failedCalls.length > 0 && (
              <>
                <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider pt-2">Failed</p>
                {failedCalls.map((c) => (
                  <CallCard key={c.id} call={c} onSelect={setSelectedCall} compact />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold font-mono mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}
