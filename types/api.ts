import { RFQ, Supplier, Call, ReasoningTrace } from './database'

export interface ApiResponse<T = any> {
  ok: boolean
  data?: T
  error?: string
}

export interface RfqCreateRequest {
  part_name: string
  specs: Record<string, any>
  quantity: number
  target_price: number
  floor_price: number
  currency?: string
  deadline?: string
  aggressiveness?: 'conservative' | 'balanced' | 'aggressive'
  max_concessions?: number
  priority?: 'price' | 'lead_time' | 'quality'
}

export interface SupplierCreateRequest {
  name: string
  phone: string
  country: string
  region?: string
  email?: string
  contact_name?: string
  language_primary?: string
  notes?: string
}

export interface DispatchResponse {
  status: string
  rfq_id: string
  supplier_count: number
}

export interface RfqResultsResponse {
  rfq: RFQ
  calls: (Call & { suppliers: Supplier })[]
}

export interface FeedbackRequest {
  rfq_id: string
  awarded_call_id: string
  actual_price: number
}

export interface FeedbackResponse {
  recorded: boolean
  price_delta_pct: number
  outcome_score: number
}

export interface TranscriptEvent {
  callId: string
  rfqId: string
  role: 'agent' | 'supplier'
  text: string
  ts: number
}

export interface CallStatusEvent {
  callId: string
  rfqId: string
  status: string
  quotedPrice: number | null
  ts: number
}

export interface TraceEvent {
  callId: string
  rfqId: string
  triggerText: string
  suggestedPosition: string
  confidence: string
  injected: boolean
  ts: number
}
