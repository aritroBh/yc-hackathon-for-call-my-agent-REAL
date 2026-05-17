/**
 * POST /api/research
 * Body: { rfq_title, rfq_description, items: string, action: "plan"|"execute", interaction_id?: string }
 *
 * "plan"    → starts Deep Research with collaborative_planning, streams plan text via SSE
 * "execute" → approves plan, executes research, creates suppliers + RFQ in DB, returns rfq_id
 */
import { NextRequest } from "next/server"
import { startResearchWithPlan, approveAndExecuteResearch, parseSuppliers } from "@/lib/deepResearch"
import { tables } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300  // 5 min max — Deep Research can be slow

function sseEvent(type: string, data: any): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json()
  const { rfq_title, rfq_description, items, action, interaction_id } = body

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: any) =>
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

          // Create RFQ in DB
          send("status", { message: "Creating RFQ..." })
          const { data: rfq } = await tables.rfqs.insert({
            title: rfq_title,
            description: rfq_description || `Sourced via Gemini Deep Research — ${new Date().toLocaleDateString()}`,
            items: [],
            target_price: null,
            floor_price: null,
            currency: "USD",
            status: "open",
            organization_id: process.env.NEXT_PUBLIC_DEMO_ORG_ID || "00000000-0000-0000-0000-000000000001",
          }).select().single()

          if (!rfq) throw new Error("Failed to create RFQ")
          const rfqId = rfq.id

          // Create suppliers + link to RFQ
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

          send("done", { step: "execute", rfq_id: rfqId })
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
