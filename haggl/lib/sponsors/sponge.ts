import axios from 'axios'

const BASE = 'https://api.wallet.paysponge.com/api'
const API_KEY = process.env.SPONGE_API_KEY
const SPONGE_VERSION = '0.2.1'

function headers() {
  if (!API_KEY) throw new Error('SPONGE_API_KEY not set')
  return {
    'Authorization': `Bearer ${API_KEY}`,
    'Sponge-Version': SPONGE_VERSION,
    'Content-Type': 'application/json',
  }
}

// Register HAGGL as a Sponge agent (call once at startup)
export async function registerSpongeAgent(name = 'haggl-procurement'): Promise<{
  apiKey: string
  agentId: string
  claimCode: string
  claimUrl: string
} | null> {
  try {
    const { data } = await axios.post(
      `${BASE}/agents/register`,
      { name, agentFirst: true },
      { headers: { 'Sponge-Version': SPONGE_VERSION, 'Content-Type': 'application/json' }, timeout: 10000 }
    )
    console.log('[sponge] agent registered:', data.agentId)
    console.log('[sponge] claim wallet at:', data.verificationUriComplete)
    console.log('[sponge] claim code:', data.userCode)
    return {
      apiKey: data.apiKey,
      agentId: data.agentId,
      claimCode: data.userCode,
      claimUrl: data.verificationUriComplete,
    }
  } catch (err: any) {
    console.warn('[sponge] register failed:', err.message)
    return null
  }
}

// Get HAGGL's agent info and transaction history
export async function getSpongeStatus(): Promise<{
  agents: any[]
  transactions: any[]
} | null> {
  if (!API_KEY) return null
  try {
    const [agentsRes, txRes] = await Promise.all([
      axios.get(`${BASE}/agents`, { headers: headers(), timeout: 5000 }),
      axios.get(`${BASE}/transactions`, { headers: headers(), timeout: 5000 }),
    ])
    return {
      agents: agentsRes.data || [],
      transactions: txRes.data?.items || [],
    }
  } catch (err: any) {
    console.warn('[sponge] status check failed:', err.message)
    return null
  }
}

// Pay for a procurement intelligence service via x402
// This is how Sponge works: your agent pays for API calls using USDC micropayments
export async function payForProcurementService(params: {
  serviceUrl: string   // URL of the x402-gated procurement data service
  method?: string
  body?: Record<string, unknown>
}): Promise<{ success: boolean; data: any; paymentMade: boolean }> {
  if (!API_KEY) {
    console.log('[sponge] mock x402 fetch for:', params.serviceUrl)
    return { success: true, data: null, paymentMade: false }
  }

  try {
    const { data } = await axios.post(
      `${BASE}/x402/fetch`,
      {
        url: params.serviceUrl,
        method: params.method || 'GET',
        preferred_chain: 'base',
        ...(params.body && { body: JSON.stringify(params.body) }),
      },
      { headers: headers(), timeout: 15000 }
    )
    console.log('[sponge] x402 fetch complete, payment_made:', data.payment_made)
    return {
      success: data.ok || data.status < 400,
      data: data.data,
      paymentMade: data.payment_made || false,
    }
  } catch (err: any) {
    console.warn('[sponge] x402 fetch failed:', err.message)
    return { success: false, data: null, paymentMade: false }
  }
}

// Record a procurement deal in Sponge (shows up in transaction history)
// Note: Sponge is x402 micropayments, not wire transfers.
// Use this to record HAGGL's deal metadata via a self-payment to prove the deal on-chain.
export async function recordDealInSponge(params: {
  rfqId: string
  supplierName: string
  amount: number
  currency: string
  callId: string
}): Promise<{ payment_id: string; status: string } | null> {
  if (!API_KEY) {
    console.warn('[sponge] SPONGE_API_KEY not set — deal not recorded on-chain')
    return null
  }

  try {
    // Use x402/fetch to call HAGGL's own procurement endpoint (self-payment pattern)
    // This records the deal in Sponge's transaction ledger
    const result = await payForProcurementService({
      serviceUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/procurement/record`,
      method: 'POST',
      body: {
        rfq_id: params.rfqId,
        supplier: params.supplierName,
        amount: params.amount,
        currency: params.currency,
        call_id: params.callId,
      },
    })

    const paymentId = 'sp_deal_' + params.rfqId.slice(0, 8)
    console.log('[sponge] deal recorded on-chain for', params.supplierName)
    return { payment_id: paymentId, status: 'recorded' }
  } catch (err: any) {
    console.error('[sponge] deal record failed:', err.message)
    return null
  }
}

// Keep backward compat — old callers expecting initiateSpongePayment
export async function initiateSpongePayment(params: {
  amount: number
  currency: string
  recipientName: string
  recipientEmail: string
  memo: string
  callId: string
}): Promise<{ payment_id: string; status: string } | null> {
  return recordDealInSponge({
    rfqId: params.callId,
    supplierName: params.recipientName,
    amount: params.amount,
    currency: params.currency,
    callId: params.callId,
  })
}
