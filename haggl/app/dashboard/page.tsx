"use client";

import { useEffect, useState, useCallback } from "react";
import { useSocket } from "@/lib/socket";
import type { NegotiationCall, LiveCallEvent, TranscriptEntry } from "@/types";

interface CallStats {
  total_today: number;
  active: number;
  completed: number;
  failed: number;
}

interface LiveTranscriptDelta {
  call_id: string;
  role: "agent" | "supplier" | "system";
  content: string;
  timestamp: string;
}

export default function DashboardPage() {
  const { socket, connected } = useSocket();
  const [calls, setCalls] = useState<NegotiationCall[]>([]);
  const [stats, setStats] = useState<CallStats>({ total_today: 0, active: 0, completed: 0, failed: 0 });
  const [liveEntries, setLiveEntries] = useState<LiveTranscriptDelta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    try {
      const res = await fetch("/api/calls");
      if (!res.ok) throw new Error("Failed to fetch calls");
      const data: NegotiationCall[] = await res.json();
      setCalls(data);
      const today = new Date().toISOString().slice(0, 10);
      const todayCalls = data.filter((c) => c.created_at?.startsWith(today));
      setStats({
        total_today: todayCalls.length,
        active: data.filter((c) => c.status === "in-progress" || c.status === "ringing").length,
        completed: data.filter((c) => c.status === "completed").length,
        failed: data.filter((c) => c.status === "failed").length,
      });
      setError(null);
    } catch {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
    const interval = setInterval(fetchCalls, 10000);
    return () => clearInterval(interval);
  }, [fetchCalls]);

  useEffect(() => {
    if (!socket) return;
    const handler = (event: LiveCallEvent) => {
      if (event.type === "transcript_delta") {
        const delta = event.data as unknown as LiveTranscriptDelta;
        setLiveEntries((prev) => [{ call_id: event.call_id, role: delta.role, content: delta.content, timestamp: delta.timestamp }, ...prev].slice(0, 100));
      }
      if (event.type === "call_initiated" || event.type === "call_failed" || event.type === "call_disconnected") {
        fetchCalls();
      }
    };
    socket.on("live_call_event", handler);
    return () => {
      socket.off("live_call_event", handler);
    };
  }, [socket, fetchCalls]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      "in-progress": "bg-blue-100 text-blue-800",
      ringing: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      pending: "bg-gray-100 text-gray-800",
      queued: "bg-purple-100 text-purple-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-800"}`}>
        {status}
      </span>
    );
  };

  const phaseBadge = (phase: string) => {
    const colors: Record<string, string> = {
      negotiation: "bg-yellow-100 text-yellow-800",
      closing: "bg-indigo-100 text-indigo-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      greeting: "bg-blue-100 text-blue-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[phase] || "bg-gray-100 text-gray-800"}`}>
        {phase}
      </span>
    );
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (error) return <div className="text-center py-12 text-red-600">{error}</div>;

  const activeCalls = calls.filter((c) => c.status === "in-progress" || c.status === "ringing");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {connected ? (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-gray-400">
            <span className="w-2 h-2 bg-gray-300 rounded-full" />
            Offline
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total Calls Today</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total_today}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Active Calls</p>
          <p className="text-3xl font-bold text-indigo-600 mt-1">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{stats.completed}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Failed</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{stats.failed}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Live Feed</h2>
          {liveEntries.length === 0 ? (
            <p className="text-gray-400 text-sm">No live events yet</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {liveEntries.map((entry, i) => (
                <div key={i} className="text-xs border-l-2 border-indigo-300 pl-3 py-1">
                  <span className="font-mono text-gray-400">{entry.call_id.slice(0, 8)} </span>
                  <span className={`font-semibold ${entry.role === "agent" ? "text-indigo-600" : entry.role === "supplier" ? "text-green-600" : "text-gray-500"}`}>
                    {entry.role}
                  </span>
                  <p className="text-gray-700 mt-0.5 truncate">{entry.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Calls</h2>
          {activeCalls.length === 0 ? (
            <p className="text-gray-400 text-sm">No active calls</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-3 pr-4 font-medium">Call ID</th>
                    <th className="pb-3 pr-4 font-medium">Supplier</th>
                    <th className="pb-3 pr-4 font-medium">Phase</th>
                    <th className="pb-3 pr-4 font-medium">Duration</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCalls.map((call) => (
                    <tr key={call.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 pr-4 font-mono text-gray-600">{call.id.slice(0, 8)}</td>
                      <td className="py-3 pr-4 text-gray-900">{call.supplier_id.slice(0, 8)}</td>
                      <td className="py-3 pr-4">{phaseBadge(call.phase)}</td>
                      <td className="py-3 pr-4 text-gray-600">{formatDuration(call.duration_seconds)}</td>
                      <td className="py-3">{statusBadge(call.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
