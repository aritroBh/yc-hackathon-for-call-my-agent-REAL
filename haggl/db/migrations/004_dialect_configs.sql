-- ──────────────────────────────────────────────────────
-- Migration 004: Dialect Configs & Learned Patterns
-- ──────────────────────────────────────────────────────

BEGIN;

-- 1. Create learned_patterns table if not exists
CREATE TABLE IF NOT EXISTS learned_patterns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id         UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  region          TEXT,
  dialect_locale  TEXT,
  patterns        JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learned_patterns_call ON learned_patterns(call_id);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_supplier ON learned_patterns(supplier_id);

-- Enable RLS for learned_patterns
ALTER TABLE learned_patterns ENABLE ROW LEVEL SECURITY;

-- Service-role policy for learned_patterns
CREATE POLICY service_role_all_learned_patterns ON learned_patterns FOR ALL USING (true) WITH CHECK (true);

-- 2. Populate/Update dialect_configs with RL-optimized patterns
INSERT INTO dialect_configs (name, locale, prompt_template, speaking_style, cultural_notes, formality_level, greeting_phrase, closing_phrase, is_active) VALUES
(
  'US East (RL-Optimized)',
  'en-US-East',
  E'You are speaking with a supplier from the US East region.\n\nKey traits:\n- Clear, direct, and professional communication.\n- Directness is highly valued; respect their time.\n- Discuss specifications and delivery timeline upfront.\n- Be firm but professional in price negotiations.\n\n=== RL-OPTIMIZED OPENERS ===\n1. [direct] "Hi [Supplier Name], this is HAGGL Procurement. I wanted to follow up on the RFQ for [Part Name] to discuss how we can align on price and lead times." — effective in establishing quick intent.\n\n=== RL-OPTIMIZED REBUTTALS ===\n1. [price] "Based on current market data for [Part Name], we are seeing standard pricing around [Target Price]. We want to build a long-term volume relationship, so can we target closer to that?" — effective when supplier quotes above target price.\n2. [delivery] "We have strict inventory requirements. If we commit to a larger annual volume, would you be able to reduce the lead time to under 10 days?" — effective for overcoming long lead times.\n\n=== REGION-SPECIFIC INSIGHTS ===\n- East Coast suppliers prefer concise, results-driven discussions. Avoid long personal stories and focus on structured commitments.\n\n=== RL KEY LEARNINGS ===\n- Fast response times and clear volume commitments are the strongest leverage points in negotiations.',
  'Clear, professional, and slightly fast-paced. Focus on volume commitments and mutual margin benefits.',
  'US East business culture values punctuality, contract structure, and clear ROI. Do not waste time with excessive small talk.',
  'semi_formal',
  'Hello, this is HAGGL Procurement calling regarding our RFQ. Do you have a few minutes to discuss details?',
  'Thank you for the constructive discussion. We will update the RFQ details and be in touch soon.',
  true
)
ON CONFLICT (locale) DO UPDATE SET
  prompt_template = EXCLUDED.prompt_template,
  speaking_style = EXCLUDED.speaking_style,
  cultural_notes = EXCLUDED.cultural_notes,
  greeting_phrase = EXCLUDED.greeting_phrase,
  closing_phrase = EXCLUDED.closing_phrase;

COMMIT;
