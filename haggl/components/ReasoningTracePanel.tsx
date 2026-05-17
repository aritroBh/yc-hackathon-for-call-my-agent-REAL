"use client";

import { useSocket } from "@/lib/socket";
import { useEffect, useState } from "react";

interface TraceEvent {
  type: string;
  call_id: string;
  supplier_id: string;
  category?: string;
  claim?: string;
  confidence?: number;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface Props {
  callId?: string;
  maxItems?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  steel_price: "bg-blue-900/30 text-blue-300 border-blue-500/30",
  regulation: "bg-purple-900/30 text-purple-300 border-purple-500/30",
  moq: "bg-amber-900/30 text-amber-300 border-amber-500/30",
  certification: "bg-emerald-900/30 text-emerald-300 border-emerald-500/30",
  shipping: "bg-cyan-900/30 text-cyan-300 border-cyan-500/30",
  geopolitical: "bg-red-900/30 text-red-300 border-red-500/30",
  raw_material: "bg-orange-900/30 text-orange-300 border-orange-500/30",
  labor_cost: "bg-violet-900/30 text-violet-300 border-violet-500/30",
  tariff: "bg-pink-900/30 text-pink-300 border-pink-500/30",
  quality: "bg-teal-900/30 text-teal-300 border-teal-500/30",
  inventory: "bg-slate-900/30 text-slate-300 border-slate-500/30",
  energy_cost: "bg-yellow-900/30 text-yellow-300 border-yellow-500/30",
  general: "bg-slate-800/30 text-slate-300 border-slate-600/30",
};

const TYPE_ICONS: Record<string, string> = {
  opus_analysis: "🧠",
  opus_injection: "💉",
  opus_timeout: "⏱️",
  opus_error: "⚠️",
};

export default function ReasoningTracePanel({ callId, maxItems = 50 }: Props) {
  const { socket, connected } = useSocket();
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handler = (event: any) => {
      const type = event.type || "";
      if (type.startsWith("opus_") || type === "negotiation_insight") {
        if (callId && event.call_id !== callId) return;
        setTraces((prev) => {
          const next = [{ ...event, timestamp: event.timestamp || new Date().toISOString() }, ...prev];
          return next.slice(0, maxItems);
        });
      }
    };
    socket.on("live_call_event", handler);
    return () => { socket.off("live_call_event", handler); };
  }, [socket, callId, maxItems]);

  if (traces.length === 0 && !connected) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4">
        <p className="text-xs text-slate-500 text-center py-4">Live reasoning traces will appear here during calls</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Opus Intelligence</span>
          {connected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
        </div>
        <span className="text-[10px] text-slate-600">{traces.length}</span>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-slate-700/30">
        {traces.map((trace, i) => {
          const catColor = trace.category ? CATEGORY_COLORS[trace.category] || CATEGORY_COLORS.general : CATEGORY_COLORS.general;
          const icon = TYPE_ICONS[trace.type] || "📡";
          const isExpanded = expanded === i;

          return (
            <div key={i} className="px-3 py-2 hover:bg-slate-700/20 transition-colors">
              <div className="flex items-start gap-2">
                <span className="text-xs mt-0.5">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${catColor}`}>
                      {trace.category || trace.type.replace("opus_", "")}
                    </span>
                    {trace.confidence != null && (
                      <span className={`text-[10px] font-mono ${
                        trace.confidence >= 0.7 ? "text-emerald-400" :
                        trace.confidence >= 0.4 ? "text-amber-400" : "text-slate-500"
                      }`}>
                        {(trace.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="text-[10px] text-slate-600 ml-auto">
                      {new Date(trace.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {trace.claim && (
                    <p className="text-[11px] text-slate-300 mt-1 line-clamp-2">{trace.claim}</p>
                  )}
                  {trace.data && (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : i)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-1"
                    >
                      {isExpanded ? "Hide details" : "View details"}
                    </button>
                  )}
                  {isExpanded && trace.data && (
                    <div className="mt-1 p-2 bg-slate-900/50 rounded text-[10px] font-mono text-slate-400 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {JSON.stringify(trace.data, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {traces.length === 0 && (
          <div className="p-6 text-center text-[10px] text-slate-600 italic">
            Waiting for intelligence...
          </div>
        )}
      </div>
    </div>
  );
}
