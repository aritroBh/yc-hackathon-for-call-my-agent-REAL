"use client";

import { useState } from "react";

interface CallData {
  id: string;
  supplier_name: string | undefined;
  supplier_id: string;
  status: string;
  phase: string;
  duration_seconds: number | null;
  quoted_price?: number | null;
  error_message?: string | null;
  result?: any;
}

interface Props {
  call: CallData;
  onSelect?: (callId: string) => void;
  compact?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-slate-600/50 bg-slate-800/50",
  queued: "border-purple-500/30 bg-purple-900/10",
  ringing: "border-amber-500/30 bg-amber-900/10",
  in_progress: "border-cyan-500/30 bg-cyan-900/10",
  completed: "border-emerald-500/30 bg-emerald-900/10",
  failed: "border-red-500/30 bg-red-900/10",
  busy: "border-orange-500/30 bg-orange-900/10",
  no_answer: "border-slate-500/30 bg-slate-800/30",
  timeout: "border-red-400/30 bg-red-900/5",
  capped: "border-yellow-500/30 bg-yellow-900/10",
};

const STATUS_DOTS: Record<string, string> = {
  pending: "bg-slate-500",
  queued: "bg-purple-400",
  ringing: "bg-amber-400 animate-pulse",
  in_progress: "bg-cyan-400 animate-pulse",
  completed: "bg-emerald-400",
  failed: "bg-red-400",
  busy: "bg-orange-400",
  no_answer: "bg-slate-400",
  timeout: "bg-red-300",
  capped: "bg-yellow-400",
};

const PHASE_BADGES: Record<string, string> = {
  greeting: "bg-blue-900/40 text-blue-300",
  disclosure: "bg-indigo-900/40 text-indigo-300",
  requirements: "bg-violet-900/40 text-violet-300",
  negotiation: "bg-amber-900/40 text-amber-300",
  closing: "bg-emerald-900/40 text-emerald-300",
  completed: "bg-emerald-900/40 text-emerald-300",
  failed: "bg-red-900/40 text-red-300",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CallCard({ call, onSelect, compact }: Props) {
  const [researchExpanded, setResearchExpanded] = useState(false);

  const borderColor = STATUS_COLORS[call.status] || STATUS_COLORS.pending;
  const dotColor = STATUS_DOTS[call.status] || STATUS_DOTS.pending;
  const phaseBadge = PHASE_BADGES[call.phase] || "bg-slate-800 text-slate-400";
  const research = call.result?.pre_call_research;

  return (
    <div
      className={`rounded-lg border ${borderColor} backdrop-blur-sm transition-all duration-200 hover:border-slate-500/50 hover:bg-slate-800/40 ${onSelect ? "cursor-pointer" : ""}`}
    >
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between" onClick={() => onSelect?.(call.id)}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
            <span className="text-sm font-medium text-slate-200 truncate">{call.supplier_name}</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">{formatDuration(call.duration_seconds)}</span>
        </div>

        <div className="flex items-center gap-2" onClick={() => onSelect?.(call.id)}>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${phaseBadge}`}>
            {call.phase}
          </span>
          <span className="text-[10px] text-slate-500 uppercase">{call.status}</span>
        </div>

        {research && (
          <div className="space-y-1.5 pt-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setResearchExpanded(!researchExpanded);
              }}
              className="flex items-center gap-1.5 text-[10px] text-indigo-300 hover:text-indigo-200 bg-indigo-950/40 border border-indigo-850/40 rounded px-2 py-1 transition-all"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
              <span>🔍 Crawler Research {researchExpanded ? "▲" : "▼"}</span>
            </button>

            {researchExpanded && (
              <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 space-y-2 text-[10.5px] leading-normal text-slate-300">
                {research.website && (
                  <div>
                    <span className="text-slate-500">Website: </span>
                    <a
                      href={research.website}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-indigo-400 hover:underline"
                    >
                      {research.website}
                    </a>
                  </div>
                )}
                {research.estimatedPriceRange && (
                  <div>
                    <span className="text-slate-500">Benchmark Price: </span>
                    <span className="font-mono text-slate-200">{research.estimatedPriceRange}</span>
                  </div>
                )}
                {research.certifications && research.certifications.length > 0 && (
                  <div>
                    <span className="text-slate-500">Certs: </span>
                    <span className="text-slate-300">{research.certifications.join(", ")}</span>
                  </div>
                )}
                {research.redFlags && research.redFlags.length > 0 && (
                  <div className="bg-red-950/20 border border-red-500/10 rounded p-1.5 text-red-300">
                    <span className="font-semibold">⚠️ Red Flags: </span>
                    <span>{research.redFlags.join(" · ")}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {call.quoted_price != null && (
          <div className="text-xs text-emerald-400 font-mono" onClick={() => onSelect?.(call.id)}>
            $ {call.quoted_price.toLocaleString()}
          </div>
        )}

        {call.error_message && (
          <div className="text-[10px] text-red-400 truncate" onClick={() => onSelect?.(call.id)}>{call.error_message}</div>
        )}

        {!compact && (
          <div className="text-[10px] font-mono text-slate-600 truncate" onClick={() => onSelect?.(call.id)}>
            {call.id.slice(0, 12)}...
          </div>
        )}
      </div>
    </div>
  );
}
