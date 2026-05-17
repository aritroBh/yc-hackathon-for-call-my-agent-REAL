"use client";

import { useEffect, useState } from "react";
import type { NegotiationCall, RFQ } from "@/types";

interface Filters {
  status: string;
  rfq_id: string;
}

export default function CallsPage() {
  const [calls, setCalls] = useState<NegotiationCall[]>([]);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ status: "", rfq_id: "" });

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.rfq_id) params.set("rfq_id", filters.rfq_id);
      const [callsRes, rfqsRes] = await Promise.all([
        fetch(`/api/calls?${params}`),
        fetch("/api/rfqs"),
      ]);
      if (!callsRes.ok) throw new Error("Failed to fetch calls");
      if (!rfqsRes.ok) throw new Error("Failed to fetch RFQs");
      setCalls(await callsRes.json());
      setRfqs(await rfqsRes.json());
      setError(null);
    } catch {
      setError("Failed to load call data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filters.status, filters.rfq_id]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      "in-progress": "bg-blue-100 text-blue-800",
      ringing: "bg-yellow-100 text-yellow-800",
      pending: "bg-gray-100 text-gray-800",
      queued: "bg-purple-100 text-purple-800",
      busy: "bg-orange-100 text-orange-800",
      "no-answer": "bg-gray-100 text-gray-800",
      rejected: "bg-pink-100 text-pink-800",
      timeout: "bg-yellow-100 text-yellow-800",
      capped: "bg-red-100 text-red-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-800"}`}>
        {status}
      </span>
    );
  };

  const phaseBadge = (phase: string) => {
    const colors: Record<string, string> = {
      greeting: "bg-blue-100 text-blue-800",
      disclosure: "bg-purple-100 text-purple-800",
      requirements: "bg-indigo-100 text-indigo-800",
      negotiation: "bg-yellow-100 text-yellow-800",
      closing: "bg-green-100 text-green-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[phase] || "bg-gray-100 text-gray-800"}`}>
        {phase}
      </span>
    );
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (error) return <div className="text-center py-12 text-red-600">{error}</div>;

  const statuses = ["", "completed", "failed", "in-progress", "ringing", "pending", "queued", "busy", "no-answer", "rejected", "timeout", "capped"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Call History</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Statuses</option>
              {statuses.filter(Boolean).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">RFQ</label>
            <select
              value={filters.rfq_id}
              onChange={(e) => setFilters((f) => ({ ...f, rfq_id: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All RFQs</option>
              {rfqs.map((rfq) => (
                <option key={rfq.id} value={rfq.id}>{rfq.title}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {calls.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No calls found matching the selected filters.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 bg-gray-50">
                  <th className="px-4 py-3 font-medium">Call ID</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Phase</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <>
                    <tr
                      key={call.id}
                      onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-mono text-gray-600">{call.id.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-gray-900">{call.supplier_id.slice(0, 8)}</td>
                      <td className="px-4 py-3">{statusBadge(call.status)}</td>
                      <td className="px-4 py-3">{phaseBadge(call.phase)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDuration(call.duration_seconds)}</td>
                      <td className="px-4 py-3 text-gray-600">{call.cost != null ? `$${(call.cost / 100).toFixed(2)}` : "--"}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(call.created_at).toLocaleDateString()}</td>
                    </tr>
                    {expandedId === call.id && (
                      <tr key={`${call.id}-expanded`}>
                        <td colSpan={7} className="px-4 py-4 bg-gray-50">
                          <div className="space-y-4">
                            {call.transcript && call.transcript.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Transcript</h4>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                  {call.transcript.map((t, i) => (
                                    <div key={i} className="text-xs border-l-2 border-gray-300 pl-2">
                                      <span className={`font-semibold ${t.role === "agent" ? "text-indigo-600" : t.role === "supplier" ? "text-green-600" : "text-gray-500"}`}>
                                        {t.role}
                                      </span>
                                      <span className="text-gray-400 ml-1">{new Date(t.timestamp).toLocaleTimeString()}</span>
                                      <p className="text-gray-700 mt-0.5">{t.content}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {call.result && (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Result</h4>
                                <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-3">
                                  {call.result.supplier_name && <p>Supplier: {call.result.supplier_name}</p>}
                                  {call.result.quoted_price != null && <p>Quoted Price: ${call.result.quoted_price}</p>}
                                  {call.result.confidence_score != null && <p>Confidence: {(call.result.confidence_score * 100).toFixed(0)}%</p>}
                                  {call.result.raw_transcript_snippet && <p className="mt-1 italic">&quot;{call.result.raw_transcript_snippet.slice(0, 200)}&quot;</p>}
                                </div>
                              </div>
                            )}
                            {call.error_message && (
                              <div>
                                <h4 className="text-xs font-semibold text-red-500 uppercase mb-2">Error</h4>
                                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{call.error_message}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
