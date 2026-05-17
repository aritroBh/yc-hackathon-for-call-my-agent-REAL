import { createClient } from '@supabase/supabase-js'
import { RFQ, Supplier, Call, CallTranscript, ReasoningTrace, Feedback, DialectConfig, RFQSupplier } from '../types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, serviceRoleKey)

// ——— RFQ ———

export async function createRfq(params: {
  user_id: string
  part_name: string
  specs: Record<string, any>
  quantity: number
  target_price: number
  floor_price_enc: string
  currency?: string
  deadline?: string
  aggressiveness?: string
  max_concessions?: number
  priority?: string
}): Promise<RFQ> {
  const { data, error } = await supabase.from('rfqs').insert([params]).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function getRfq(id: string): Promise<RFQ | null> {
  const { data, error } = await supabase.from('rfqs').select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function getRfqWithFloorPrice(id: string): Promise<(RFQ & { _floorPrice: number }) | null> {
  const rfq = await getRfq(id)
  if (!rfq) return null
  const { decryptFloorPrice } = await import('./encryption')
  const _floorPrice = decryptFloorPrice(rfq.floor_price_enc)
  return { ...rfq, _floorPrice }
}

export async function listRfqs(userId: string): Promise<RFQ[]> {
  const { data, error } = await supabase.from('rfqs').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function updateRfqStatus(id: string, status: RFQ['status']): Promise<void> {
  const updates: any = { status }
  if (status === 'completed') updates.completed_at = new Date().toISOString()
  const { error } = await supabase.from('rfqs').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
}

// ——— Supplier ———

export async function createSupplier(params: {
  user_id: string
  name: string
  country: string
  region?: string
  phone: string
  email?: string
  contact_name?: string
  language_primary?: string
  notes?: string
}): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').insert([params]).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function bulkCreateSuppliers(userId: string, rows: any[]): Promise<{ ok: boolean; supplier?: Supplier; error?: string }[]> {
  const results: { ok: boolean; supplier?: Supplier; error?: string }[] = []
  for (const row of rows) {
    try {
      const supplier = await createSupplier({ user_id: userId, ...row })
      results.push({ ok: true, supplier })
    } catch (err: any) {
      results.push({ ok: false, error: err.message })
    }
  }
  return results
}

export async function listSuppliers(userId: string, filters?: { country?: string; region?: string }): Promise<Supplier[]> {
  let query = supabase.from('suppliers').select('*').eq('user_id', userId).order('name')
  if (filters?.country) query = query.eq('country', filters.country)
  if (filters?.region) query = query.eq('region', filters.region)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).single()
  if (error) return null
  return data
}

// ——— RFQ-Supplier ———

export async function addSupplierToRfq(rfqId: string, supplierId: string): Promise<void> {
  const { error } = await supabase.from('rfq_suppliers').insert([{ rfq_id: rfqId, supplier_id: supplierId }])
  if (error) throw new Error(error.message)
}

export async function getRfqSuppliers(rfqId: string): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('rfq_suppliers')
    .select('suppliers(*)')
    .eq('rfq_id', rfqId)
  if (error) throw new Error(error.message)
  return (data || []).map((row: any) => row.suppliers).filter(Boolean)
}

// ——— Calls ———

export async function createCall(params: { rfq_id: string; supplier_id: string }): Promise<Call> {
  const { data, error } = await supabase.from('calls').insert([params]).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function getCall(id: string): Promise<Call | null> {
  const { data, error } = await supabase.from('calls').select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function getCallByCallSid(callSid: string): Promise<Call | null> {
  const { data, error } = await supabase.from('calls').select('*').eq('call_sid', callSid).single()
  if (error) return null
  return data
}

export async function updateCallSid(callId: string, callSid: string): Promise<void> {
  const { error } = await supabase.from('calls').update({ call_sid: callSid }).eq('id', callId)
  if (error) throw new Error(error.message)
}

export async function updateCallStatus(callId: string, status: Call['status'], extra?: Partial<Call>): Promise<void> {
  const updates: any = { status, ...extra }
  if (status === 'in_progress' && !extra?.started_at) updates.started_at = new Date().toISOString()
  if (['completed', 'failed', 'no_answer'].includes(status) && !extra?.ended_at) updates.ended_at = new Date().toISOString()
  const { error } = await supabase.from('calls').update(updates).eq('id', callId)
  if (error) throw new Error(error.message)
}

export async function appendTranscript(callId: string, line: string): Promise<void> {
  const { data: call } = await supabase.from('calls').select('transcript').eq('id', callId).single()
  const existing = call?.transcript || ''
  const updated = existing ? existing + '\n' + line : line
  const { error } = await supabase.from('calls').update({ transcript: updated }).eq('id', callId)
  if (error) throw new Error(error.message)
}

export async function addCallTranscript(callId: string, role: 'agent' | 'supplier', content: string): Promise<void> {
  const { error } = await supabase.from('call_transcripts').insert([{ call_id: callId, role, content }])
  if (error) throw new Error(error.message)
}

export async function getRfqCalls(rfqId: string): Promise<(Call & { suppliers: Supplier })[]> {
  const { data, error } = await supabase
    .from('calls')
    .select('*, suppliers(*)')
    .eq('rfq_id', rfqId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as any
}

export async function updateCallScores(callId: string, scores: Partial<Call>): Promise<void> {
  const { error } = await supabase.from('calls').update(scores).eq('id', callId)
  if (error) throw new Error(error.message)
}

export async function setRecommended(callId: string): Promise<void> {
  const { error } = await supabase.from('calls').update({ recommended: true }).eq('id', callId)
  if (error) throw new Error(error.message)
}

export async function countActiveCalls(rfqId: string): Promise<number> {
  const { count, error } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('rfq_id', rfqId)
    .in('status', ['queued', 'calling', 'in_progress'])
  if (error) throw new Error(error.message)
  return count || 0
}

// ——— Reasoning Traces ———

export async function addReasoningTrace(params: {
  call_id: string
  trigger_text: string
  opus_response: any
  moss_results: any
  injected: boolean
  injection_delay_ms: number | null
}): Promise<void> {
  const { error } = await supabase.from('reasoning_traces').insert([params])
  if (error) throw new Error(error.message)
}

// ——— Feedback ———

export async function createFeedback(params: {
  rfq_id: string
  awarded_call_id?: string
  actual_price?: number
  price_delta_pct?: number
  outcome_score?: number
}): Promise<void> {
  const { error } = await supabase.from('feedback').insert([params])
  if (error) throw new Error(error.message)
}

export async function getPendingRlFeedback(): Promise<any[]> {
  const { data, error } = await supabase.from('feedback').select('*').eq('rl_processed', false)
  if (error) throw new Error(error.message)
  return data || []
}
