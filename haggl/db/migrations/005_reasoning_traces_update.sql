-- Widen trace_type to accept new types from live intel + Sponge
ALTER TABLE reasoning_traces
  DROP CONSTRAINT IF EXISTS reasoning_traces_trace_type_check;

ALTER TABLE reasoning_traces
  ADD CONSTRAINT reasoning_traces_trace_type_check
  CHECK (trace_type IN (
    'deepgram_event',
    'llm_prompt',
    'llm_response',
    'function_call',
    'negotiation_logic',
    'error',
    'live_intel_injection',
    'sponge_deal_record'
  ));

-- Make call_id nullable so Sponge records without a call context work
ALTER TABLE reasoning_traces
  ALTER COLUMN call_id DROP NOT NULL;

-- Also widen provider to accept 'sponge'
ALTER TABLE reasoning_traces
  DROP CONSTRAINT IF EXISTS reasoning_traces_provider_check;

ALTER TABLE reasoning_traces
  ADD CONSTRAINT reasoning_traces_provider_check
  CHECK (provider IN ('deepgram', 'gemini', 'claude', 'system', 'sponge'));
