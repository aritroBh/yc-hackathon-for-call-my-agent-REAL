import Supermemory from 'supermemory'

const API_KEY = process.env.SUPERMEMORY_API_KEY

let _client: Supermemory | null = null
function getClient(): Supermemory | null {
  if (!API_KEY) return null
  if (!_client) _client = new Supermemory({ apiKey: API_KEY })
  return _client
}

// ── Container tags ───────────────────────────────────
// Three separate memory spaces:
export const CONTAINERS = {
  BASE:       'haggl-base',                 // Consolidated base knowledge, grown by the RL loop
  COMPANY:    'haggl-company-context',      // Who HAGGL is, what it does
  LANGUAGES:  'haggl-language-context',     // Twi, Yoruba, Hindi, cultural negotiation rules
  VENDORS:    'haggl-vendor-context',       // Supplier knowledge, procurement patterns
  NEGOTIATIONS: 'haggl-negotiations',       // Live call outcomes (existing)
} as const

// ── READ: Vendor memory (called during live calls) ───
export async function getSupplierMemory(
  supplierName: string,
  region?: string,
): Promise<string> {
  const client = getClient()
  if (!client) { console.warn('[supermemory] no key — skipping supplier memory'); return "" }

  try {
    // Search consolidated base knowledge, vendor context, and live history
    const [baseRes, vendorRes, negotiationRes] = await Promise.all([
      client.search.documents({
        q: `${supplierName} ${region || ''} procurement pricing benchmarks`.trim(),
        containerTags: [CONTAINERS.BASE],
      }),
      client.search.documents({
        q: `${supplierName} ${region || ''} supplier vendor`.trim(),
        containerTags: [CONTAINERS.VENDORS],
      }),
      client.search.documents({
        q: `${supplierName} ${region || ''} negotiation history`.trim(),
        containerTags: [CONTAINERS.NEGOTIATIONS],
      }),
    ])

    const all = [
      ...(baseRes.results || []),
      ...(vendorRes.results || []),
      ...(negotiationRes.results || []),
    ]

    if (all.length === 0) return ""

    return all
      .map((m: any) => {
        if (m.chunks && Array.isArray(m.chunks) && m.chunks.length > 0) {
          return m.chunks.map((c: any) => c.content).filter(Boolean).join(' ')
        }
        return m.content || m.document?.content || ''
      })
      .filter(Boolean)
      .join('\n')
  } catch (err: any) {
    console.warn('[supermemory] getSupplierMemory failed:', err.message)
    return ""
  }
}

// ── READ: Language context (called before each call) ─
export async function getLanguageContext(locale: string): Promise<string> {
  const client = getClient()
  if (!client) return ''

  try {
    const [baseRes, langRes] = await Promise.all([
      client.search.documents({
        q: locale + ' language negotiation phrases culture',
        containerTags: [CONTAINERS.BASE],
      }),
      client.search.documents({
        q: locale + ' language negotiation culture business',
        containerTags: [CONTAINERS.LANGUAGES],
      }),
    ])
    return [...(baseRes.results || []), ...(langRes.results || [])]
      .map((m: any) => {
        if (m.chunks && Array.isArray(m.chunks) && m.chunks.length > 0) {
          return m.chunks.map((c: any) => c.content).filter(Boolean).join(' ')
        }
        return m.content || m.document?.content || ''
      })
      .filter(Boolean)
      .join('\n')
  } catch (err: any) {
    console.warn('[supermemory] getLanguageContext failed:', err.message)
    return ''
  }
}

// ── READ: Company context ─────────────────────────────
export async function getCompanyContext(query: string): Promise<string> {
  const client = getClient()
  if (!client) return ''

  try {
    const res = await client.search.documents({
      q: query,
      containerTags: [CONTAINERS.COMPANY],
    })
    return (res.results || [])
      .map((m: any) => {
        if (m.chunks && Array.isArray(m.chunks) && m.chunks.length > 0) {
          return m.chunks.map((c: any) => c.content).filter(Boolean).join(' ')
        }
        return m.content || m.document?.content || ''
      })
      .filter(Boolean)
      .join('\n')
  } catch (err: any) {
    console.warn('[supermemory] getCompanyContext failed:', err.message)
    return ''
  }
}

// ── WRITE: Store live negotiation outcome ─────────────
export async function storeNegotiationMemory(params: {
  supplierName: string
  region: string
  outcome: string
  quotedPrice: number | null
  leadTimeDays: number | null
  certifications: string[]
  callId: string
}): Promise<void> {
  const client = getClient()
  if (!client) { console.log('[supermemory] store skipped — no key'); return }

  const content =
    `Supplier ${params.supplierName} in ${params.region}: ` +
    `quoted $${params.quotedPrice || 'none'}/unit, ` +
    `lead time ${params.leadTimeDays || 'TBD'} days, ` +
    `outcome: ${params.outcome}, ` +
    `certifications: ${params.certifications.join(', ') || 'none'}. ` +
    `Call ID: ${params.callId}`

  try {
    await client.add({
      content,
      containerTag: CONTAINERS.NEGOTIATIONS,
      metadata: {
        supplier: params.supplierName,
        region: params.region,
        outcome: params.outcome,
        ...(params.quotedPrice !== null ? { quoted_price: params.quotedPrice } : {}),
        call_id: params.callId,
      },
    })
    console.log('[supermemory] stored negotiation memory for', params.supplierName)
  } catch (err: any) {
    console.warn('[supermemory] store failed:', err.message)
  }
}

// ── WRITE: Promote a learned fact into base knowledge ──
// Called by the RL loop so effective rebuttals grow the base every cycle.
export async function promoteToBaseMemory(fact: string): Promise<void> {
  const client = getClient()
  if (!client) return
  if (!fact || !fact.trim()) return

  try {
    await client.add({
      content: fact,
      containerTag: CONTAINERS.BASE,
      metadata: { promoted_at: new Date().toISOString(), source: 'rl_promotion' },
    })
    console.log('[supermemory] promoted to base:', fact.slice(0, 80))
  } catch (err: any) {
    console.warn('[supermemory] promotion failed:', err.message)
  }
}
