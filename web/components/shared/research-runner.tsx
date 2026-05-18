"use client";

/**
 * Phase-2 driver. Invisible controller mounted once in the (app) layout
 * so the long Gemini Deep Research SSE survives navigation between Home,
 * Research and run pages (it would die if owned by a single page).
 *
 * Lifecycle: plan-canvas commit calls `createRun(plan)` which makes the
 * run active with `research.status = "running"`. This opens
 * `/api/plan/research` (proxied to haggl) and writes progress back into
 * THAT run by id (`patchRunResearch`/`setRunPlan`) — so it completes
 * correctly even if the user navigates to another run while it streams
 * (mirrors to the live fields only while that run is the active one).
 *
 * One stream at a time (per the product decision): a module guard keeps
 * a single SSE; a second "New research run" started mid-stream waits for
 * the current one to finish.
 */

import { useEffect } from "react";
import { useAtlas } from "@/lib/store";
import { applyResearchedSuppliers } from "@/lib/plan";
import type { ResearchedSupplier } from "@/lib/types";

let inFlight = false;

export function ResearchRunner() {
  const status = useAtlas((s) => s.researchStatus);
  const answers = useAtlas((s) => s.onboardingAnswers);

  useEffect(() => {
    if (status !== "running" || inFlight) return;

    const runId = useAtlas.getState().activeRunId;
    if (!runId) return;
    inFlight = true;

    const store = () => useAtlas.getState();

    if (!answers) {
      inFlight = false;
      store().patchRunResearch(runId, {
        status: "error",
        message: "No sourcing brief to research — start from onboarding.",
      });
      return;
    }

    // Keep streaming even if the user leaves this run; bail only if the
    // run is gone or its research is no longer "running" (superseded).
    const stillRunning = () => {
      const r = store().runs[runId];
      return !!r && r.research.status === "running";
    };

    (async () => {
      try {
        store().patchRunResearch(runId, {
          message: "Starting Gemini Deep Research…",
        });

        const res = await fetch("/api/plan/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });

        const ctype = res.headers.get("content-type") || "";
        if (!res.ok || !res.body || !ctype.includes("text/event-stream")) {
          let msg = `Research backend error (${res.status}).`;
          try {
            const j = await res.json();
            if (j?.error) msg = String(j.error);
          } catch {
            /* not JSON */
          }
          store().patchRunResearch(runId, { status: "error", message: msg });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        for (;;) {
          if (!stillRunning()) {
            await reader.cancel().catch(() => {});
            return;
          }
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // haggl emits `data: {json}\n\n` per SSE frame.
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            let evt: {
              type?: string;
              message?: string;
              suppliers?: ResearchedSupplier[];
              name?: string;
              rfq_id?: string;
            };
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            const st = store();
            switch (evt.type) {
              case "status":
                st.patchRunResearch(runId, {
                  message: String(evt.message ?? ""),
                });
                break;

              case "plan":
                st.patchRunResearch(runId, {
                  message:
                    "Research plan approved — running deep research (this can take several minutes)…",
                });
                break;

              case "suppliers_found": {
                const companies = (evt.suppliers ?? []) as ResearchedSupplier[];
                // Swap the fast Flash-Lite seed suppliers for the real
                // researched ones; keep the full dossiers for the run's
                // per-company context view.
                const cur = st.runs[runId]?.plan ?? null;
                if (cur)
                  st.setRunPlan(runId, applyResearchedSuppliers(cur, companies));
                st.patchRunResearch(runId, {
                  companies,
                  message: `Found ${companies.length} ${
                    companies.length === 1 ? "company" : "companies"
                  } — saving call dossiers…`,
                });
                // ── NEXT STEP · Supermemory ───────────────────────────
                // Each company's specialization + notes is the per-call
                // negotiation context. haggl already persists it on the
                // supplier row (metadata.source = "gemini_deep_research";
                // see haggl persistResearch()). To make the voice agent
                // USE it: in haggl/lib/sponsors/supermemory.ts write each
                // dossier into CONTAINERS.VENDORS and promoteToBaseMemory()
                // the durable learnings, so getSupplierMemory() surfaces
                // it to the negotiation prompt before dialing.
                break;
              }

              case "supplier_created":
                st.patchRunResearch(runId, {
                  message: `Saved ${evt.name ?? "supplier"} to the call list…`,
                });
                break;

              case "done":
                st.patchRunResearch(runId, { status: "done", message: null });
                break;

              case "error":
                st.patchRunResearch(runId, {
                  status: "error",
                  message: String(evt.message ?? "Research failed."),
                });
                break;
            }
          }
        }
      } catch (err) {
        if (stillRunning()) {
          const m = err instanceof Error ? err.message : "";
          store().patchRunResearch(runId, {
            status: "error",
            message: m
              ? `Research connection lost: ${m}`
              : "Research connection lost.",
          });
        }
      } finally {
        inFlight = false;
      }
    })();
  }, [status, answers]);

  return null;
}
