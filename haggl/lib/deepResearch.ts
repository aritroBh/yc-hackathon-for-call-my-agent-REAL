/**
 * Gemini Deep Research integration.
 * Uses the Interactions API (v1beta) with agent deep-research-preview-04-2026.
 * Collaborative planning: first shows a plan, user approves, then executes.
 *
 * PHONE HARDCODING (demo):
 *   West Africa / Twi / Akan / Ghana  → +13187506130
 *   India / Hindi / South Asia        → +19257818082
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const BASE = "https://generativelanguage.googleapis.com/v1beta"
const AGENT = "deep-research-preview-04-2026"

// Hardcoded demo phones per region
const DEMO_PHONES: Record<string, { phone: string; language: string }> = {
  ghana: { phone: "+13187506130", language: "twi" },
  "west africa": { phone: "+13187506130", language: "twi" },
  twi: { phone: "+13187506130", language: "twi" },
  akan: { phone: "+13187506130", language: "twi" },
  nigeria: { phone: "+13187506130", language: "yoruba" },
  india: { phone: "+19257818082", language: "hindi" },
  hindi: { phone: "+19257818082", language: "hindi" },
  ludhiana: { phone: "+19257818082", language: "hindi" },
  surat: { phone: "+19257818082", language: "hindi" },
  tiruppur: { phone: "+19257818082", language: "hindi" },
  "south asia": { phone: "+19257818082", language: "hindi" },
}

function resolvePhone(text: string): { phone: string; language: string } {
  const lower = text.toLowerCase()
  for (const [key, val] of Object.entries(DEMO_PHONES)) {
    if (lower.includes(key)) return val
  }
  return { phone: "+13187506130", language: "twi" } // default
}

export interface ResearchInteraction {
  id: string
  status: "pending" | "running" | "completed" | "failed"
  plan?: string   // returned when collaborative_planning=true before execution
  report?: string // final markdown report
  error?: string
}

export interface DiscoveredSupplier {
  name: string
  country: string
  region: string
  language: string
  phone: string
  specialization: string
  notes: string
}

/** Step 1: Start a research task with collaborative planning ON.
 *  Returns interaction id + the proposed research plan text. */
export async function startResearchWithPlan(rfqTitle: string, rfqDescription: string, items: string): Promise<{ interactionId: string; plan: string }> {
  const input = `You are a procurement research specialist.
A US buyer needs to source the following:

RFQ TITLE: ${rfqTitle}
DESCRIPTION: ${rfqDescription}
ITEMS: ${items}

Research and identify 2 to 4 real, verified suppliers who can fulfill this procurement.
Focus specifically on:
1. West African suppliers (Ghana preferred, Twi/Akan speaking) — textile, agricultural, manufactured goods
2. Indian suppliers (Hindi speaking, North India preferred) — textile, manufacturing, export

For each supplier find: company name, country, region/city, contact website or LinkedIn, specialization, and why they are a fit for this RFQ.

Return a structured JSON array of suppliers at the END of your report in this exact format:
\`\`\`json
[
  {
    "name": "Company Name",
    "country": "Ghana",
    "region": "Accra",
    "specialization": "Kente cloth export",
    "website": "example.com",
    "notes": "AGOA certified, GSA mark, 10+ years export experience"
  }
]
\`\`\``

  const res = await fetch(`${BASE}/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      input,
      agent: AGENT,
      background: true,
      collaborative_planning: true,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Deep Research start failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  const interactionId: string = data.id

  // Poll until we get the plan (status becomes "awaiting_plan_approval" or similar)
  // or until it's completed (if collaborative_planning is fast)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const pollRes = await fetch(`${BASE}/interactions/${interactionId}`, {
      headers: { "x-goog-api-key": GEMINI_API_KEY },
    })
    const poll = await pollRes.json()

    if (poll.status === "awaiting_plan_approval" || poll.plan) {
      const planText = poll.plan?.content?.[0]?.text || poll.steps?.[0]?.content?.[0]?.text || "Research plan ready."
      return { interactionId, plan: planText }
    }

    if (poll.status === "completed") {
      // Research completed without waiting for plan approval
      const report = poll.steps?.at(-1)?.content?.[0]?.text || ""
      return { interactionId: interactionId + ":done:" + encodeURIComponent(report), plan: "Research completed." }
    }

    if (poll.status === "failed") {
      throw new Error(`Deep Research failed: ${poll.error}`)
    }
  }

  throw new Error("Deep Research plan step timed out after 3 minutes")
}

/** Step 2: Approve the plan and wait for the full research to complete. */
export async function approveAndExecuteResearch(interactionId: string): Promise<string> {
  // If already done (encoded in id), return immediately
  if (interactionId.includes(":done:")) {
    return decodeURIComponent(interactionId.split(":done:")[1])
  }

  // Approve the plan
  const approveRes = await fetch(`${BASE}/interactions/${interactionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({ action: "approve_plan" }),
  })

  if (!approveRes.ok) {
    // Some versions don't need explicit approval — just poll
    console.warn("[deepResearch] approve_plan returned", approveRes.status, "— polling anyway")
  }

  // Poll for completion
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(`${BASE}/interactions/${interactionId}`, {
      headers: { "x-goog-api-key": GEMINI_API_KEY },
    })
    const poll = await pollRes.json()

    if (poll.status === "completed") {
      return poll.steps?.at(-1)?.content?.[0]?.text || ""
    }
    if (poll.status === "failed") {
      throw new Error(`Research failed: ${poll.error}`)
    }
  }

  throw new Error("Deep Research execution timed out after 10 minutes")
}

/** Parse the research report markdown to extract structured suppliers. */
export function parseSuppliers(report: string): DiscoveredSupplier[] {
  // Try to extract JSON block from report
  const jsonMatch = report.match(/```json\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      const raw: any[] = JSON.parse(jsonMatch[1].trim())
      return raw.slice(0, 4).map((s: any) => {
        const { phone, language } = resolvePhone(`${s.country || ""} ${s.region || ""} ${s.name || ""}`)
        return {
          name: s.name || "Unknown Supplier",
          country: s.country || "Unknown",
          region: s.region || s.country || "Unknown",
          language,
          phone,
          specialization: s.specialization || "General procurement",
          notes: s.notes || s.website || "",
        }
      })
    } catch {
      // fall through to text parsing
    }
  }

  // Fallback: extract supplier-like paragraphs
  const lines = report.split("\n")
  const suppliers: DiscoveredSupplier[] = []
  let current: Partial<DiscoveredSupplier> | null = null

  for (const line of lines) {
    const cleaned = line.replace(/^#+\s*/, "").trim()
    if (!cleaned) continue

    // Detect company name lines (bold or heading)
    if (/^(\*\*|###?\s*)/.test(line) && cleaned.length < 80 && !cleaned.toLowerCase().includes("research")) {
      if (current?.name) suppliers.push(current as DiscoveredSupplier)
      const { phone, language } = resolvePhone(cleaned + " " + (current?.country || ""))
      current = { name: cleaned.replace(/\*+/g, ""), phone, language, specialization: "", notes: "", country: "", region: "" }
    }

    if (current) {
      if (/ghana|accra|kumasi/i.test(cleaned)) { current.country = "Ghana"; current.region = cleaned.match(/Accra|Kumasi|Takoradi/i)?.[0] || "Ghana" }
      if (/nigeria|lagos|abuja|kano/i.test(cleaned)) { current.country = "Nigeria"; current.region = cleaned.match(/Lagos|Abuja|Kano/i)?.[0] || "Nigeria" }
      if (/india|ludhiana|surat|tiruppur|mumbai|delhi/i.test(cleaned)) { current.country = "India"; current.region = cleaned.match(/Ludhiana|Surat|Tiruppur|Mumbai|Delhi|Kolkata/i)?.[0] || "India" }
      if (current.country) {
        const resolved = resolvePhone(current.country + " " + current.region)
        current.phone = resolved.phone
        current.language = resolved.language
      }
      if (!current.specialization) current.specialization = cleaned.slice(0, 120)
      if (!current.notes && cleaned.length > 20) current.notes = cleaned.slice(0, 200)
    }

    if (suppliers.length >= 4) break
  }

  if (current?.name) suppliers.push(current as DiscoveredSupplier)

  return suppliers.slice(0, 4).filter(s => s.name && s.name.length > 2)
}
