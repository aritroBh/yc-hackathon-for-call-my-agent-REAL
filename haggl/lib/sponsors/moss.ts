import { MossClient } from '@moss-dev/moss'

const MOSS_PROJECT_ID = process.env.MOSS_PROJECT_ID
const MOSS_PROJECT_KEY = process.env.MOSS_PROJECT_KEY
const MOSS_INDEX_NAME = 'haggl-procurement-intel'

let _client: MossClient | null = null

function getMossClient(): MossClient | null {
  if (!MOSS_PROJECT_ID || !MOSS_PROJECT_KEY) return null
  if (!_client) _client = new MossClient(MOSS_PROJECT_ID, MOSS_PROJECT_KEY)
  return _client
}

// Call this once at app startup to seed the index with procurement knowledge
export async function initMossIndex(): Promise<void> {
  const client = getMossClient()
  if (!client) return
  try {
    const existing = await client.getIndex(MOSS_INDEX_NAME).catch(() => null)
    if (existing) return // already seeded
    const procurementDocs = [
      { id: 'doc-1', text: 'Initial supplier quotes in manufacturing typically carry a 12-18% negotiation margin above final settled price.' },
      { id: 'doc-2', text: 'Net 30 payment terms are standard in B2B procurement. Net 60 is negotiable for orders over $50,000.' },
      { id: 'doc-3', text: 'ISO 9001 certification indicates a quality management system. ISO 14001 is environmental. AS9100D is aerospace.' },
      { id: 'doc-4', text: 'FOB (Free On Board) means risk transfers at origin port. CIF (Cost Insurance Freight) includes shipping to destination.' },
      { id: 'doc-5', text: 'Steel prices track LME benchmarks. Aluminum spot prices fluctuate with energy costs.' },
      { id: 'doc-6', text: 'Lead time inflation by suppliers is common. Published lead times are often padded by 20-30%.' },
      { id: 'doc-7', text: 'MOQ (Minimum Order Quantity) is always negotiable for repeat customers or long-term commitments.' },
      { id: 'doc-8', text: 'Supplier capacity utilization above 85% typically means less price flexibility and longer lead times.' },
      { id: 'doc-9', text: 'Payment in advance or Letter of Credit often yields 3-5% price reduction from suppliers.' },
      { id: 'doc-10', text: 'Certification claims (ISO, CE, FDA) can be verified via official registries. Always request certificate numbers.' },
    ]
    await client.createIndex(MOSS_INDEX_NAME, procurementDocs, { modelId: 'moss-minilm' })
    console.log('[moss] index initialized with procurement knowledge')
  } catch (err: any) {
    console.warn('[moss] init failed:', err.message)
  }
}

export async function searchMossForContext(
  query: string
): Promise<{ facts: string[]; sources: string[] } | null> {
  const client = getMossClient()
  if (!client) return null
  try {
    await client.loadIndex(MOSS_INDEX_NAME)
    const results = await client.query(MOSS_INDEX_NAME, query, { topK: 4 })
    if (!results?.docs?.length) return null
    return {
      facts: results.docs.map((d: any) => d.text),
      sources: results.docs.map(() => 'Moss Procurement Index'),
    }
  } catch (err: any) {
    console.warn('[moss] query failed:', err.message)
    return null
  }
}

export async function addProcurementFact(fact: string): Promise<void> {
  const client = getMossClient()
  if (!client) return
  try {
    const docId = 'fact-' + Math.random().toString(36).substring(2, 11)
    await client.addDocs(MOSS_INDEX_NAME, [{ id: docId, text: fact }], { upsert: true })
  } catch (err: any) {
    console.warn('[moss] addDocs failed:', err.message)
  }
}
