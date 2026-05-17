export interface DialectConfig {
  id: string
  region: string
  language_primary: string
  opening_style: 'casual' | 'formal' | 'relationship-first'
  pacing: 'direct' | 'gradual'
  code_switch_pattern: string | null
  system_prompt_addendum: string
  updated_at: string
}

export interface Supplier {
  id: string
  user_id: string
  name: string
  country: string
  region: string | null
  phone: string
  email: string | null
  contact_name: string | null
  language_primary: string | null
  dialect_config_id: string | null
  past_deals_count: number
  reliability_score: number | null
  notes: string | null
  created_at: string
}

export interface RFQ {
  id: string
  user_id: string
  part_name: string
  specs: Record<string, any>
  quantity: number
  target_price: number
  floor_price_enc: string
  currency: string
  deadline: string | null
  aggressiveness: 'conservative' | 'balanced' | 'aggressive'
  max_concessions: number
  priority: 'price' | 'lead_time' | 'quality'
  status: 'draft' | 'dispatching' | 'active' | 'completed' | 'cancelled' | 'failed'
  created_at: string
  completed_at: string | null
}

export interface RFQSupplier {
  id: string
  rfq_id: string
  supplier_id: string
}

export interface Call {
  id: string
  rfq_id: string
  supplier_id: string
  call_sid: string | null
  status: 'queued' | 'calling' | 'in_progress' | 'completed' | 'failed' | 'no_answer'
  started_at: string | null
  ended_at: string | null
  duration_sec: number | null
  transcript: string
  quoted_price: number | null
  lead_time_days: number | null
  terms: Record<string, any>
  price_score: number | null
  communication_score: number | null
  composite_score: number | null
  recommended: boolean
  created_at: string
}

export interface CallTranscript {
  id: string
  call_id: string
  role: 'agent' | 'supplier'
  content: string
  ts: string
}

export interface ReasoningTrace {
  id: string
  call_id: string
  trigger_text: string | null
  opus_response: Record<string, any> | null
  moss_results: Record<string, any> | null
  injected: boolean
  injection_delay_ms: number | null
  created_at: string
}

export interface Feedback {
  id: string
  rfq_id: string
  awarded_call_id: string | null
  actual_price: number | null
  price_delta_pct: number | null
  outcome_score: number | null
  rl_processed: boolean
  created_at: string
}
