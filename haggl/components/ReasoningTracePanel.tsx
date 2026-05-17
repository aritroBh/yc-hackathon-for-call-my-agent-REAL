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
  data?: any;
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
    if (callId) {
      fetch(`/api/calls/${callId}/traces`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setTraces(data.map(d => ({
              type: d.trace_type,
              call_id: d.input_data?.call_id,
              supplier_id: "",
              category: d.category || "general",
              claim: d.input_data?.supplier_turn,
              confidence: d.output_data?.confidence === 'high' ? 0.9 : d.output_data?.confidence === 'medium' ? 0.5 : 0.2,
              timestamp: d.created_at,
              data: d.output_data
            })));
          }
        })
        .catch(console.error);
    }
  }, [callId]);

  useEffect(() => {
    if (!socket) return;
    const handler = (event: any) => {
      const type = event.type || event.traceType || "";
      if (type.startsWith("opus_") || type === "negotiation_insight" || type === "live_intel_injection") {
        const evCallId = event.callId || event.call_id;
        if (callId && evCallId !== callId) return;
        setTraces((prev) => {
          const next = [{ ...event, type, timestamp: event.timestamp || new Date().toISOString() }, ...prev];
          return next.slice(0, maxItems);
        });
      }
    };
    socket.on("live_call_event", handler);
    socket.on("reasoning_trace", handler);
    return () => { 
      socket.off("live_call_event", handler);
      socket.off("reasoning_trace", handler);
    };
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
                    <div className="mt-2 space-y-2 p-2.5 bg-slate-900/80 border border-slate-700/50 rounded-md text-[10px] text-slate-300 max-h-60 overflow-y-auto font-sans leading-relaxed">
                      {trace.data.rebuttal_context && (
                        <div>
                          <strong className="text-cyan-400 block font-semibold mb-0.5">Rebuttal Context:</strong>
                          <span className="text-slate-200">{String(trace.data.rebuttal_context)}</span>
                        </div>
                      )}
                      {trace.data.suggested_position && (
                        <div className="mt-1.5">
                          <strong className="text-indigo-400 block font-semibold mb-0.5">Suggested Position:</strong>
                          <span className="text-slate-200 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-900/30 block mt-0.5 font-mono text-[9px]">{String(trace.data.suggested_position)}</span>
                        </div>
                      )}
                      
                      {trace.data.moss_facts && Array.isArray(trace.data.moss_facts) && trace.data.moss_facts.length > 0 && (
                        <div className="border-t border-slate-700/50 pt-2 mt-2">
                          <strong className="text-emerald-400 flex items-center gap-1 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            Moss Semantic Search Context
                          </strong>
                          <ul className="list-disc pl-4 space-y-0.5 mt-1 text-slate-400 text-[9px]">
                            {trace.data.moss_facts.map((fact: string, idx: number) => (
                              <li key={idx}>{fact}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {trace.data.supermemory_context && (
                        <div className="border-t border-slate-700/50 pt-2 mt-2">
                          <strong className="text-pink-400 flex items-center gap-1 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 shrink-0" />
                            Supermemory Historic Context
                          </strong>
                          <p className="mt-1 text-slate-400 text-[9px] bg-pink-950/10 p-1.5 rounded border border-pink-900/20 font-mono leading-normal whitespace-pre-wrap">{String(trace.data.supermemory_context)}</p>
                        </div>
                      )}
                      
                      {trace.data.pre_call_research && (
                        <div className="border-t border-slate-700/50 pt-2 mt-2">
                          <strong className="text-purple-400 flex items-center gap-1 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                            Browser Use Pre-Call crawler Context
                          </strong>
                          <pre className="mt-1 p-1.5 bg-slate-950 rounded text-slate-400 font-mono text-[8px] overflow-x-auto whitespace-pre-wrap max-h-24 leading-normal">
                            {JSON.stringify(trace.data.pre_call_research, null, 2)}
                          </pre>
                        </div>
                      )}
                      
                      {!trace.data.moss_facts && !trace.data.pre_call_research && !trace.data.supermemory_context && (
                        <pre className="p-1 bg-slate-950 rounded text-slate-400 font-mono text-[9px] overflow-x-auto whitespace-pre-wrap max-h-24 mt-1.5">
                          {JSON.stringify(trace.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {traces.length === 0 && (
          <div className="p-6 text-center text-[10px] text-slate-600 italic">
            Waiting for supplier claims to trigger intel injection...
          </div>
        )}
      </div>
    </div>
  );
}
