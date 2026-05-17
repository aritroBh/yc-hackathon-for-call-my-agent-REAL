-- ──────────────────────────────────────────────
-- HAGGL Core Schema
-- Migration 001: Initial tables
-- ──────────────────────────────────────────────

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  api_key TEXT UNIQUE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  dialect_prompt TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','blacklisted')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_suppliers_org ON suppliers(organization_id);
CREATE INDEX idx_suppliers_phone ON suppliers(phone);

-- RFQs
CREATE TABLE IF NOT EXISTS rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  floor_price NUMERIC,
  target_price NUMERIC,
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','open','negotiating','closed','awarded')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_rfqs_org ON rfqs(organization_id);
CREATE INDEX idx_rfqs_status ON rfqs(status);

-- Negotiation calls
CREATE TABLE IF NOT EXISTS negotiation_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  rfq_id UUID REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  twilio_call_sid TEXT,
  stream_sid TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending','queued','ringing','in-progress','completed',
    'failed','busy','no-answer','rejected','timeout','capped'
  )),
  phase TEXT DEFAULT 'greeting' CHECK (phase IN (
    'greeting','disclosure','requirements','negotiation',
    'closing','completed','failed'
  )),
  duration_seconds INTEGER,
  cost NUMERIC,
  transcript JSONB DEFAULT '[]',
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_calls_rfq ON negotiation_calls(rfq_id);
CREATE INDEX idx_calls_supplier ON negotiation_calls(supplier_id);
CREATE INDEX idx_calls_status ON negotiation_calls(status);
CREATE INDEX idx_calls_twilio ON negotiation_calls(twilio_call_sid);

-- Negotiation results
CREATE TABLE IF NOT EXISTS negotiation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES negotiation_calls(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name TEXT,
  quoted_price NUMERIC,
  quoted_terms TEXT,
  delivery_timeline TEXT,
  confidence_score NUMERIC DEFAULT 0,
  raw_transcript_snippet TEXT,
  structured_offer JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_results_call ON negotiation_results(call_id);
CREATE INDEX idx_results_supplier ON negotiation_results(supplier_id);

-- Opus analyses
CREATE TABLE IF NOT EXISTS opus_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES negotiation_calls(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name TEXT,
  negotiation_effectiveness NUMERIC,
  price_competitiveness NUMERIC,
  communication_quality NUMERIC,
  objections_raised JSONB DEFAULT '[]',
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  recommended_next_action TEXT,
  raw_analysis TEXT,
  timestamp TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_opus_call ON opus_analyses(call_id);

-- Call logs
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES negotiation_calls(id) ON DELETE CASCADE,
  level TEXT DEFAULT 'info' CHECK (level IN ('info','warn','error','debug')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_logs_call ON call_logs(call_id);

-- RL feedback
CREATE TABLE IF NOT EXISTS rl_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES negotiation_calls(id) ON DELETE CASCADE,
  rfq_id UUID REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_category TEXT,
  feedback_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_feedback_call ON rl_feedback(call_id);
CREATE INDEX idx_feedback_rfq ON rl_feedback(rfq_id);

-- Migration tracker
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sql TEXT,
  applied_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiation_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE opus_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rl_feedback ENABLE ROW LEVEL SECURITY;

-- Service-role bypass policies
DO $$ BEGIN
  CREATE POLICY "service_role_all" ON organizations FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN CREATE POLICY "service_role_all" ON suppliers FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role_all" ON rfqs FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role_all" ON negotiation_calls FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role_all" ON negotiation_results FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role_all" ON opus_analyses FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role_all" ON call_logs FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role_all" ON rl_feedback FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
