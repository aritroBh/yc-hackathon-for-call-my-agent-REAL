"use client";

import { Sparkle, Phone, Languages } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { stamp } from "@/lib/format";

function agentNote(
  status: string,
  terms: string | null | undefined,
  error: string | null | undefined,
): string {
  if (status === "completed" && terms)
    return `Locked: ${terms}. Strongest terms so far - recommend confirming before the 24h hold expires.`;
  if (status === "capped" || status === "completed")
    return error || "Held the line at your cap - supplier wouldn't meet it. Moving on.";
  return "Negotiating live - holding your $5.00/unit cap and pushing on lead time.";
}

export function LedgerRowDetail({ callId }: { callId: string }) {
  const call = useAtlas((s) => s.calls[callId]);
  const supplier = useAtlas((s) =>
    call ? s.suppliers[call.supplier_id] : undefined,
  );
  if (!call) return null;

  const meta = (supplier?.metadata ?? {}) as Record<string, string>;
  const lines = call.transcript.slice(-4);
  const isDeal = call.status === "completed" && call.result?.quoted_price != null;

  return (
    <div className="space-y-4 border-t border-border bg-clay-tint/30 px-5 py-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <Phone className="size-3.5 text-ink-3" />
          {supplier?.phone ?? "-"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Languages className="size-3.5 text-ink-3" />
          Speaking {meta.language ?? "-"}
        </span>
        <span className="font-mono">
          {meta.city ?? "-"}, {meta.region ?? "-"}
        </span>
      </div>

      <div className="rounded-md border border-border bg-surface px-4 py-3.5">
        <p className="mb-2.5 font-mono text-[10px] tracking-[0.12em] text-ink-3">
          TRANSCRIPT{" "}
          {meta.language && meta.language !== "English"
            ? `· translated from ${meta.language}`
            : ""}
        </p>
        {lines.length === 0 ? (
          <p className="text-[13px] text-ink-3">Connecting…</p>
        ) : (
          <ul className="space-y-2.5">
            {lines.map((t, i) => {
              const tr = (t.metadata?.translation_en as string) || t.content;
              return (
                <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
                  <span className="w-16 shrink-0 font-mono text-[11px] tabular text-ink-3">
                    {stamp(t.timestamp)}
                  </span>
                  <span className="text-ink">
                    <span className="font-semibold capitalize text-ink-2">
                      {t.role}:
                    </span>{" "}
                    {tr}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2.5">
        <Sparkle className="mt-0.5 size-3.5 shrink-0 text-clay" />
        <p className="flex-1 text-[13px] leading-relaxed text-ink-2">
          {agentNote(call.status, call.result?.quoted_terms, call.error_message)}
        </p>
        {isDeal && (
          <Button size="sm" className="shrink-0">
            Lock deal
          </Button>
        )}
      </div>
    </div>
  );
}
