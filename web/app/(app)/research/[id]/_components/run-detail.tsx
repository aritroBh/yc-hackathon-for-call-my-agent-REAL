"use client";

/**
 * Per-run page. Mirrors the run into the live store (`loadRun`) and
 * renders the existing <DashboardView/>, which already branches:
 *   research running  → "Researching your suppliers" (Mode A: connect)
 *   research done      → dossiers + "Start calling" (→ Mode B)
 *   callingStarted     → live ledger / KPIs (Mode B)
 *   demo run (idle)    → "Ready when you are" → seed simulation
 * So no Mode A/B rebuild — one loadRun + the component we already have.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { DashboardView } from "@/app/(app)/dashboard/_components/dashboard-view";

export function RunDetail({ id }: { id: string }) {
  const router = useRouter();
  const exists = useAtlas((s) => !!s.runs[id]);
  const title = useAtlas((s) => s.runs[id]?.title ?? "Run");
  const loadRun = useAtlas((s) => s.loadRun);
  const snapshotActiveRun = useAtlas((s) => s.snapshotActiveRun);

  useEffect(() => {
    if (!exists) {
      router.replace("/research");
      return;
    }
    loadRun(id);
    // Persist live progress back into the run when leaving this page.
    return () => snapshotActiveRun();
  }, [id, exists, loadRun, snapshotActiveRun, router]);

  if (!exists) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-5 py-2.5">
        <Link
          href="/research"
          className="flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[12px] text-ink-3 transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Research
        </Link>
        <span className="text-ink-3">/</span>
        <span className="truncate font-mono text-[12px] text-ink-2">
          {title}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <DashboardView />
      </div>
    </div>
  );
}
