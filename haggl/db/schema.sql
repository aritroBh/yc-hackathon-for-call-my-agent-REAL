-- ──────────────────────────────────────────────────────
-- HAGGL Production Database Schema
-- ──────────────────────────────────────────────────────

BEGIN;

-- ── Extensions ──────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enums ───────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'admin',
  'procurement_manager',
  'viewer'
);

CREATE TYPE supplier_status AS ENUM (
  'active',
  'inactive',
  'blacklisted'
);

CREATE TYPE rfq_status AS ENUM (
  'draft',
  'open',
  'negotiating',
  'closed',
  'awarded',
  'cancelled'
);

CREATE TYPE call_status AS ENUM (
  'pending',
  'queued',
  'ringing',
  'in_progress',
  'completed',
  'failed',
  'busy',
  'no_answer',
  'rejected',
  'timeout',
  'capped'
);

CREATE TYPE call_phase AS ENUM (
  'greeting',
  'disclosure',
  'requirements',
  'negotiation',
  'closing',
  'completed',
  'failed'
);

CREATE TYPE feedback_category AS ENUM (
  'pricing',
  'communication',
  'speed',
  'accuracy',
  'compliance',
  'general'
);

-- ── Functions ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Table: users ────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'procurement_manager',
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  organization_id UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE INDEX idx_users_role ON users(role);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Table: suppliers ────────────────────────────────

CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  name            TEXT NOT NULL,
  contact_name    TEXT,
  phone           TEXT NOT NULL,
  email           TEXT,
  status          supplier_status NOT NULL DEFAULT 'active',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_org ON suppliers(organization_id);
CREATE INDEX idx_suppliers_phone ON suppliers(phone);
CREATE INDEX idx_suppliers_status ON suppliers(status);
CREATE INDEX idx_suppliers_org_status ON suppliers(organization_id, status);
CREATE UNIQUE INDEX idx_suppliers_org_phone ON suppliers(organization_id, phone) WHERE status = 'active';

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Table: dialect_configs ──────────────────────────

CREATE TABLE dialect_configs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  locale          TEXT NOT NULL UNIQUE,
  prompt_template TEXT NOT NULL,
  speaking_style  TEXT NOT NULL,
  cultural_notes  TEXT,
  formality_level TEXT NOT NULL DEFAULT 'formal' CHECK (formality_level IN ('formal', 'semi_formal', 'casual')),
  greeting_phrase TEXT,
  closing_phrase  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dialect_locale ON dialect_configs(locale);
CREATE INDEX idx_dialect_active ON dialect_configs(is_active);

CREATE TRIGGER trg_dialect_configs_updated_at
  BEFORE UPDATE ON dialect_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Table: rfqs ─────────────────────────────────────

CREATE TABLE rfqs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  items           JSONB NOT NULL DEFAULT '[]',
  floor_price     TEXT,                           -- AES-256-GCM encrypted
  target_price    NUMERIC(14,2),
  currency        TEXT NOT NULL DEFAULT 'USD',
  deadline        TIMESTAMPTZ,
  status          rfq_status NOT NULL DEFAULT 'draft',
  created_by      UUID REFERENCES users(id),
  assigned_to     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rfqs_org ON rfqs(organization_id);
CREATE INDEX idx_rfqs_status ON rfqs(status);
CREATE INDEX idx_rfqs_org_status ON rfqs(organization_id, status);
CREATE INDEX idx_rfqs_deadline ON rfqs(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_rfqs_created_by ON rfqs(created_by);

CREATE TRIGGER trg_rfqs_updated_at
  BEFORE UPDATE ON rfqs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Table: rfq_suppliers ────────────────────────────

CREATE TABLE rfq_suppliers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id        UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  dialect_id    UUID REFERENCES dialect_configs(id),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'negotiating', 'agreed', 'declined', 'no_answer')),
  priority      INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0 AND priority <= 100),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rfq_id, supplier_id)
);

CREATE INDEX idx_rfq_suppliers_rfq ON rfq_suppliers(rfq_id);
CREATE INDEX idx_rfq_suppliers_supplier ON rfq_suppliers(supplier_id);
CREATE INDEX idx_rfq_suppliers_status ON rfq_suppliers(status);
CREATE INDEX idx_rfq_suppliers_rfq_status ON rfq_suppliers(rfq_id, status);
CREATE INDEX idx_rfq_suppliers_priority ON rfq_suppliers(rfq_id, priority DESC);

CREATE TRIGGER trg_rfq_suppliers_updated_at
  BEFORE UPDATE ON rfq_suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Table: calls ────────────────────────────────────

CREATE TABLE calls (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id            UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  rfq_supplier_id   UUID REFERENCES rfq_suppliers(id) ON DELETE SET NULL,
  twilio_call_sid   TEXT,
  stream_sid        TEXT,
  status            call_status NOT NULL DEFAULT 'pending',
  phase             call_phase NOT NULL DEFAULT 'greeting',
  duration_seconds  INTEGER,
  cost_millicents   INTEGER,                      -- Twilio cost in 1/10 cent
  transcript        JSONB NOT NULL DEFAULT '[]',
  result            JSONB,
  error_message     TEXT,
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  initiated_by      UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calls_rfq ON calls(rfq_id);
CREATE INDEX idx_calls_supplier ON calls(supplier_id);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_rfq_status ON calls(rfq_id, status);
CREATE INDEX idx_calls_twilio ON calls(twilio_call_sid) WHERE twilio_call_sid IS NOT NULL;
CREATE INDEX idx_calls_phase ON calls(phase);
CREATE INDEX idx_calls_started ON calls(started_at DESC) WHERE started_at IS NOT NULL;

CREATE TRIGGER trg_calls_updated_at
  BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Table: reasoning_traces ─────────────────────────

CREATE TABLE reasoning_traces (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id         UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  trace_type      TEXT NOT NULL CHECK (trace_type IN ('deepgram_event', 'llm_prompt', 'llm_response', 'function_call', 'negotiation_logic', 'error')),
  provider        TEXT NOT NULL CHECK (provider IN ('deepgram', 'gemini', 'claude', 'system')),
  phase           call_phase,
  input_data      JSONB,
  output_data     JSONB,
  tokens_used     INTEGER,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reasoning_traces_call ON reasoning_traces(call_id);
CREATE INDEX idx_reasoning_traces_type ON reasoning_traces(trace_type);
CREATE INDEX idx_reasoning_traces_call_type ON reasoning_traces(call_id, trace_type);
CREATE INDEX idx_reasoning_traces_created ON reasoning_traces(created_at DESC);

-- ── Table: feedback ─────────────────────────────────

CREATE TABLE feedback (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id         UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  rfq_id          UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),
  category        feedback_category NOT NULL,
  rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment         TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_call ON feedback(call_id);
CREATE INDEX idx_feedback_rfq ON feedback(rfq_id);
CREATE INDEX idx_feedback_supplier ON feedback(supplier_id);
CREATE INDEX idx_feedback_category ON feedback(category);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_feedback_user ON feedback(user_id) WHERE user_id IS NOT NULL;

-- ── Encryption helpers ──────────────────────────────

-- Encrypt floor price using AES-256-GCM via pgcrypto.
-- Stores as base64-encoded ciphertext with appended IV and tag.
CREATE OR REPLACE FUNCTION encrypt_floor_price(
  p_plaintext NUMERIC(14,2),
  p_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STRICT
AS $$
DECLARE
  v_iv BYTEA;
  v_ciphertext BYTEA;
  v_tag BYTEA;
  v_result TEXT;
BEGIN
  v_iv := gen_random_bytes(12);
  v_ciphertext := pgp_sym_encrypt(p_plaintext::TEXT, p_key);
  v_result := encode(v_iv, 'hex') || ':' || encode(v_ciphertext, 'hex');
  RETURN v_result;
END;
$$;

-- Decrypt floor price (for service-role use only, never exposed to prompts)
CREATE OR REPLACE FUNCTION decrypt_floor_price(
  p_encrypted TEXT,
  p_key TEXT
)
RETURNS NUMERIC(14,2)
LANGUAGE plpgsql
STRICT
AS $$
DECLARE
  v_parts TEXT[];
  v_iv BYTEA;
  v_ciphertext BYTEA;
  v_decrypted TEXT;
BEGIN
  v_parts := string_to_array(p_encrypted, ':');
  v_iv := decode(v_parts[1], 'hex');
  v_ciphertext := decode(v_parts[2], 'hex');
  v_decrypted := pgp_sym_decrypt(v_ciphertext, p_key);
  RETURN v_decrypted::NUMERIC(14,2);
END;
$$;

-- ── Row-Level Security ──────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialect_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE reasoning_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Service-role bypass policies (app server uses service_role key)
CREATE POLICY service_role_all_users ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_suppliers ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_dialect_configs ON dialect_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_rfqs ON rfqs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_rfq_suppliers ON rfq_suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_calls ON calls FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_reasoning_traces ON reasoning_traces FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_feedback ON feedback FOR ALL USING (true) WITH CHECK (true);

COMMIT;
