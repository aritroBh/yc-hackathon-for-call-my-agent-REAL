"use client";

interface CallData {
  id: string;
  supplier_name: string | undefined;
  supplier_id: string;
  status: string;
  phase: string;
  duration_seconds: number | null;
  quoted_price?: number | null;
  error_message?: string | null;
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
  const borderColor = STATUS_COLORS[call.status] || STATUS_COLORS.pending;
  const dotColor = STATUS_DOTS[call.status] || STATUS_DOTS.pending;
  const phaseBadge = PHASE_BADGES[call.phase] || "bg-slate-800 text-slate-400";

  return (
    <div
      onClick={() => onSelect?.(call.id)}
      className={`rounded-lg border ${borderColor} backdrop-blur-sm transition-all duration-200 hover:border-slate-500/50 hover:bg-slate-800/40 ${onSelect ? "cursor-pointer" : ""}`}
    >
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
            <span className="text-sm font-medium text-slate-200 truncate">{call.supplier_name}</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">{formatDuration(call.duration_seconds)}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${phaseBadge}`}>
            {call.phase}
          </span>
          <span className="text-[10px] text-slate-500 uppercase">{call.status}</span>
        </div>

        {call.quoted_price != null && (
          <div className="text-xs text-emerald-400 font-mono">
            $ {call.quoted_price.toLocaleString()}
          </div>
        )}

        {call.error_message && (
          <div className="text-[10px] text-red-400 truncate">{call.error_message}</div>
        )}

        {!compact && (
          <div className="text-[10px] font-mono text-slate-600 truncate">
            {call.id.slice(0, 12)}...
          </div>
        )}
      </div>
    </div>
  );
}
