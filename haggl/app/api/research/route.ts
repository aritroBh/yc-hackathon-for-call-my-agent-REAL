/**
 * POST /api/research
 * Body: { rfq_title, rfq_description, items: string, action: "plan"|"execute"|"research", interaction_id?: string }
 *
 * "plan"     → starts the REAL Deep Research API (collaborative_planning), SSE
 * "execute"  → approves a prior plan, executes the REAL Deep Research, persists
 * "research" → the path the `web/` frontend uses. For the competition this
 *              MIMICS Deep Research with Gemini 3.1 Flash + web search
 *              (fastResearch) — seconds, not the ~3–13 min real agent —
 *              while keeping the exact same SSE events + supplier shape.
 *              See the WHY note on fastResearch() in lib/deepResearch.ts.
 */
import { NextRequest } from "next/server"
import {
  startResearchWithPlan,
  approveAndExecuteResearch,
  fastResearch,
  parseSuppliers,
  type DiscoveredSupplier,
} from "@/lib/deepResearch"
import { tables } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300  // 5 min hint (Vercel only); local self-host has no hard cut

function sseEvent(type: string, data: any): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`
}

type Send = (type: string, data: any) => void

/** Create the RFQ + supplier records and link them; emits progress events.
 *  Shared by the "execute" and "research" actions. Returns the new rfq id. */
async function persistResearch(
  send: Send,
  rfqTitle: string,
  rfqDescription: string,
  suppliers: DiscoveredSupplier[],
): Promise<string> {
  send("status", { message: "Creating RFQ..." })
  const { data: rfq } = await tables.rfqs.insert({
    title: rfqTitle,
    description: rfqDescription || `Sourced via Gemini Deep Research — ${new Date().toLocaleDateString()}`,
    items: [],
    target_price: null,
    floor_price: null,
    currency: "USD",
    status: "open",
    organization_id: process.env.NEXT_PUBLIC_DEMO_ORG_ID || "00000000-0000-0000-0000-000000000001",
  }).select().single()

  if (!rfq) throw new Error("Failed to create RFQ")
  const rfqId = rfq.id

  // ── NEXT STEP · Supermemory ──────────────────────────────────────
  // Each supplier below carries a research dossier (specialization +
  // notes) in `metadata`. That is the per-call negotiation context the
  // voice agent should know before dialing. To wire it:
  //   1. import { storeVendorContext, promoteToBaseMemory, CONTAINERS }
  //      from "@/lib/sponsors/supermemory"
  //   2. after each supplier insert, write the dossier into
  //      CONTAINERS.VENDORS keyed by supplier.id / company name, e.g.
  //      `${s.name} — ${s.specialization}. ${s.notes}` (region/language
  //      tagged) so getSupplierMemory() surfaces it in the negotiation
  //      prompt, and promoteToBaseMemory() the durable, cross-call
  //      learnings into CONTAINERS.BASE.
  //   3. the live call path (lib/negotiation/core.ts) already reads
  //      getSupplierMemory(); once (2) lands it picks this up for free.
  // Mirrored by the web-side note in components/shared/research-runner.tsx.
  send("status", { message: "Creating supplier records..." })
  for (const s of suppliers) {
    const { data: supplier } = await tables.suppliers.insert({
      name: s.name,
      contact_name: s.name,
      phone: s.phone,
      email: null,
      metadata: {
        language: s.language,
        region: s.region,
        country: s.country,
        specialization: s.specialization,
        notes: s.notes,
        source: "gemini_deep_research",
      },
      organization_id: process.env.NEXT_PUBLIC_DEMO_ORG_ID || "00000000-0000-0000-0000-000000000001",
      status: "active",
    }).select().single()

    if (supplier) {
      await tables.rfq_suppliers.insert({
        rfq_id: rfqId,
        supplier_id: supplier.id,
        priority: 5,
        status: "pending",
      })
      send("supplier_created", { supplier_id: supplier.id, name: s.name, phone: s.phone, language: s.language })
    }
  }

  return rfqId
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json()
  const { rfq_title, rfq_description, items, action, interaction_id } = body

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send: Send = (type, data) =>
        controller.enqueue(encoder.encode(sseEvent(type, data)))

      try {
        if (action === "plan") {
          send("status", { message: "Starting Gemini Deep Research..." })

          const { interactionId, plan } = await startResearchWithPlan(
            rfq_title,
            rfq_description,
            items,
          )

          send("plan", { interactionId, plan })
          send("done", { step: "plan" })

        } else if (action === "execute") {
          if (!interaction_id) throw new Error("interaction_id required for execute")

          send("status", { message: "Approving research plan..." })
          const report = await approveAndExecuteResearch(interaction_id)

          send("status", { message: "Parsing supplier prospects..." })
          const suppliers = parseSuppliers(report)

          if (suppliers.length === 0) {
            throw new Error("Deep Research found no parseable suppliers. Try a more specific description.")
          }

          send("suppliers_found", { suppliers })

          const rfqId = await persistResearch(send, rfq_title, rfq_description, suppliers)
          send("done", { step: "execute", rfq_id: rfqId })

        } else if (action === "research") {
          // ── COMPETITION: mimic Deep Research, don't call its API ──────
          // The real agent takes ~3–13 min (see "plan"/"execute" above);
          // unusable for a watched live demo. fastResearch() uses Gemini
          // 3.1 Flash + Google Search grounding to produce the SAME
          // report (a ```json supplier block) in seconds, so parseSuppliers
          // + persistResearch + every SSE event below are unchanged and
          // the web UI/mock needs zero changes. Flip back to
          // startResearchWithPlan/approveAndExecuteResearch for production.
          send("status", {
            message: "Researching suppliers — Gemini 3.1 Flash + web search…",
          })
          const report = await fastResearch(rfq_title, rfq_description, items)

          send("status", { message: "Parsing supplier prospects..." })
          const suppliers = parseSuppliers(report)

          if (suppliers.length === 0) {
            throw new Error("Research found no parseable suppliers. Try a more specific description.")
          }

          send("suppliers_found", { suppliers })

          // COMPETITION: the web mock drives the call ledger from its own
          // seed simulation and already has the dossiers from
          // `suppliers_found` above. Persisting RFQ/suppliers to Supabase
          // is for the (future) real call engine, so make it best-effort
          // here — a missing Supabase env must NOT fail the demo run.
          try {
            const rfqId = await persistResearch(send, rfq_title, rfq_description, suppliers)
            send("done", { step: "research", rfq_id: rfqId })
          } catch (persistErr: any) {
            send("status", {
              message: `Skipped DB persist (${persistErr?.message || "unavailable"}) — dossiers ready.`,
            })
            send("done", { step: "research" })
          }

        } else {
          throw new Error(`Unknown action "${action}". Use "plan", "execute", or "research".`)
        }

      } catch (err: any) {
        send("error", { message: err.message || "Research failed" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
