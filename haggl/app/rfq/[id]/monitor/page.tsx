"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";

interface TranscriptTurn {
  role: string;
  content: string;
  timestamp?: string;
}

interface CallEntry {
  id: string;
  supplier_id: string;
  supplier_name: string;
  phone: string;
  status: string;
  transcript: TranscriptTurn[];
}

interface Trace {
  callId?: string;
  data?: {
    confidence?: string;
    rebuttal_context?: string;
    suggested_position?: string;
  };
  claim?: string;
  timestamp?: string;
}

const statusColor = (s: string) =>
  s === "ringing" || s === "queued" || s === "pending"
    ? "text-yellow-400"
    : s === "in_progress"
      ? "text-green-400"
      : s === "completed"
        ? "text-slate-400"
        : "text-red-400";

export default function MonitorPage() {
  const { id: rfqId } = useParams<{ id: string }>();
  const router = useRouter();
  const { socket } = useSocket();
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [rfqTitle, setRfqTitle] = useState<string>("");

  const loadState = useCallback(async () => {
    try {
      const res = await fetch(`/api/rfq/${rfqId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.error) return;

      const supplierMap = new Map<string, { name: string; phone: string }>();
      for (const link of data.suppliers || []) {
        const s = link.supplier || link;
        if (s?.id) supplierMap.set(s.id, { name: s.name || "Unknown supplier", phone: s.phone || "" });
      }

      setRfqTitle(data.title || "");
      setCalls(
        (data.calls || []).map((c: any) => {
          const s = supplierMap.get(c.supplier_id);
          return {
            id: c.id,
            supplier_id: c.supplier_id,
            supplier_name: s?.name || "Unknown supplier",
            phone: s?.phone || "",
            status: c.status,
            transcript: Array.isArray(c.transcript) ? c.transcript : [],
          };
        }),
      );
    } catch {
      /* best-effort — socket events will still flow */
    }
  }, [rfqId]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    if (!socket) return;

    const onStatus = (d: any) => {
      if (d.rfqId && d.rfqId !== rfqId) return;
      setCalls((prev) => {
        const known = prev.some((c) => c.id === d.callId);
        if (!known) {
          // A new call appeared (live dispatch) — re-pull joined state.
          loadState();
          return prev;
        }
        return prev.map((c) => (c.id === d.callId ? { ...c, status: d.status } : c));
      });
    };

    const onTranscript = (d: any) => {
      if (!d?.entry) return;
      setCalls((prev) =>
        prev.map((c) =>
          c.id === d.callId ? { ...c, transcript: [...(c.transcript || []), d.entry] } : c,
        ),
      );
    };

    const onTrace = (d: Trace) => {
      setTraces((prev) => [d, ...prev].slice(0, 20));
    };

    socket.on("call_status_changed", onStatus);
    socket.on("transcript_delta", onTranscript);
    socket.on("reasoning_trace", onTrace);

    return () => {
      socket.off("call_status_changed", onStatus);
      socket.off("transcript_delta", onTranscript);
      socket.off("reasoning_trace", onTrace);
    };
  }, [socket, rfqId, loadState]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6 font-mono">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Live Negotiation Monitor</h1>
          <p className="text-slate-500 text-sm">{rfqTitle || `RFQ ${rfqId}`}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/rfq/${rfqId}/results`)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm"
          >
            View Results
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-3">
          {calls.length === 0 && (
            <div className="text-slate-500 text-sm p-4 border border-slate-800 rounded">
              No calls dispatched yet…
            </div>
          )}
          {calls.map((call) => {
            const lastTurn = call.transcript?.[call.transcript.length - 1];
            return (
              <div
                key={call.id}
                className={`border rounded p-4 cursor-pointer transition-colors ${
                  activeCallId === call.id ? "border-indigo-500" : "border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => setActiveCallId(activeCallId === call.id ? null : call.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{call.supplier_name}</span>
                  <span className={`text-xs uppercase ${statusColor(call.status)}`}>
                    {call.status.replace(/_/g, " ")}
                  </span>
                </div>
                {call.phone && <p className="text-xs text-slate-500">{call.phone}</p>}

                {!activeCallId && lastTurn && (
                  <p className="text-xs text-slate-300 mt-2 border-t border-slate-800 pt-2">
                    <span className={lastTurn.role === "assistant" ? "text-indigo-400" : "text-emerald-400"}>
                      {lastTurn.role === "assistant" ? "HAGGL" : "Supplier"}:
                    </span>{" "}
                    {lastTurn.content}
                  </p>
                )}

                {activeCallId === call.id && (
                  <div className="mt-3 border-t border-slate-800 pt-3 space-y-2 max-h-80 overflow-auto">
                    {(call.transcript || []).length === 0 && (
                      <p className="text-xs text-slate-600">No transcript yet…</p>
                    )}
                    {(call.transcript || []).map((t, i) => (
                      <p key={i} className="text-xs text-slate-300">
                        <span className={t.role === "assistant" ? "text-indigo-400" : "text-emerald-400"}>
                          {t.role === "assistant" ? "HAGGL" : "Supplier"}:
                        </span>{" "}
                        {t.content}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border border-slate-800 rounded p-4 h-fit">
          <h2 className="text-xs uppercase text-slate-500 mb-3 font-bold">Live Intel Injections</h2>
          {traces.length === 0 && (
            <p className="text-slate-600 text-xs">Waiting for supplier claims…</p>
          )}
          {traces.map((t, i) => (
            <div key={i} className="mb-3 p-2 bg-slate-900 rounded text-xs border border-slate-800">
              <div
                className={`text-[10px] uppercase font-bold mb-1 ${
                  t.data?.confidence === "high"
                    ? "text-green-400"
                    : t.data?.confidence === "medium"
                      ? "text-yellow-400"
                      : "text-red-400"
                }`}
              >
                {t.data?.confidence || "?"} confidence
              </div>
              {t.claim && <p className="text-slate-500 mb-1 italic">“{t.claim}”</p>}
              <p className="text-slate-300 mb-1">{t.data?.rebuttal_context}</p>
              <p className="text-slate-500">{t.data?.suggested_position}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
