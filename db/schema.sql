CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS dialect_configs (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  region TEXT UNIQUE NOT NULL,
  language_primary TEXT NOT NULL DEFAULT 'en',
  opening_style TEXT CHECK (opening_style IN ('casual','formal','relationship-first')),
  pacing TEXT CHECK (pacing IN ('direct','gradual')),
  code_switch_pattern TEXT,
  system_prompt_addendum TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  contact_name TEXT,
  language_primary TEXT DEFAULT 'en',
  dialect_config_id TEXT REFERENCES dialect_configs(id),
  past_deals_count INT DEFAULT 0,
  reliability_score NUMERIC(3,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfqs (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_name TEXT NOT NULL,
  specs JSONB DEFAULT '{}',
  quantity INT NOT NULL,
  target_price NUMERIC(12,2) NOT NULL,
  floor_price_enc TEXT NOT NULL,
  currency TEXT DEFAULT 'USD',
  deadline DATE,
  aggressiveness TEXT CHECK (aggressiveness IN ('conservative','balanced','aggressive')) DEFAULT 'balanced',
  max_concessions INT DEFAULT 2,
  priority TEXT CHECK (priority IN ('price','lead_time','quality')) DEFAULT 'price',
  status TEXT CHECK (status IN ('draft','dispatching','active','completed','cancelled','failed')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rfq_suppliers (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  rfq_id TEXT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  UNIQUE(rfq_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  rfq_id TEXT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  call_sid TEXT UNIQUE,
  status TEXT CHECK (status IN ('queued','calling','in_progress','completed','failed','no_answer')) DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_sec INT,
  transcript TEXT DEFAULT '',
  quoted_price NUMERIC(12,2),
  lead_time_days INT,
  terms JSONB DEFAULT '{}',
  price_score NUMERIC(4,3),
  communication_score NUMERIC(4,3),
  composite_score NUMERIC(4,3),
  recommended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_transcripts (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('agent','supplier')) NOT NULL,
  content TEXT NOT NULL,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reasoning_traces (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  trigger_text TEXT,
  opus_response JSONB,
  moss_results JSONB,
  injected BOOLEAN DEFAULT FALSE,
  injection_delay_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  rfq_id TEXT NOT NULL REFERENCES rfqs(id),
  awarded_call_id TEXT REFERENCES calls(id),
  actual_price NUMERIC(12,2),
  price_delta_pct NUMERIC(6,3),
  outcome_score NUMERIC(4,3),
  rl_processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calls_rfq_id ON calls(rfq_id);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_call_transcripts_call_id ON call_transcripts(call_id);
CREATE INDEX idx_reasoning_traces_call_id ON reasoning_traces(call_id);
CREATE INDEX idx_feedback_rl ON feedback(rl_processed) WHERE rl_processed = FALSE;
CREATE INDEX idx_rfqs_user_id ON rfqs(user_id);
CREATE INDEX idx_suppliers_user_id ON suppliers(user_id);

ALTER TABLE dialect_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reasoning_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own suppliers" ON suppliers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users manage own rfqs" ON rfqs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users manage own rfq_suppliers" ON rfq_suppliers FOR ALL USING (rfq_id IN (SELECT id FROM rfqs WHERE user_id = auth.uid()));
CREATE POLICY "users manage own calls" ON calls FOR ALL USING (rfq_id IN (SELECT id FROM rfqs WHERE user_id = auth.uid()));
CREATE POLICY "users manage own transcripts" ON call_transcripts FOR ALL USING (call_id IN (SELECT id FROM calls WHERE rfq_id IN (SELECT id FROM rfqs WHERE user_id = auth.uid())));
CREATE POLICY "users manage own traces" ON reasoning_traces FOR ALL USING (call_id IN (SELECT id FROM calls WHERE rfq_id IN (SELECT id FROM rfqs WHERE user_id = auth.uid())));
CREATE POLICY "users manage own feedback" ON feedback FOR ALL USING (rfq_id IN (SELECT id FROM rfqs WHERE user_id = auth.uid()));
CREATE POLICY "dialect_configs readable by all" ON dialect_configs FOR SELECT USING (true);
