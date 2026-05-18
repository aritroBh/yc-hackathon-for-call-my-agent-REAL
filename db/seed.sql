INSERT INTO dialect_configs (region, language_primary, opening_style, pacing, code_switch_pattern, system_prompt_addendum) VALUES
('Bangladesh / West Bengal', 'bn', 'relationship-first', 'gradual', 'Bengali and English mixed; technical terms in English', 'Open warmly in Bengali. Ask about their business before price. Long-term partnership framing works better than urgency. Silence after price offer = consideration, not rejection. Expect multiple rounds. Use আপনি (aapni) formal address throughout.'),
('North India', 'hi', 'relationship-first', 'gradual', 'English with Hindi fillers: acha, theek hai, haan', 'Open warmly. Ask one brief rapport question before price. Expect Hindi mid-sentence — parse naturally. "Acha" = acknowledgement. "Theek hai" = agreed. Be patient.'),
('South India', 'en', 'formal', 'direct', 'Formal English, minimal fillers', 'Be direct from sentence one. State part and quantity immediately. Reference exact specs. Skip small talk entirely.'),
('China Mandarin', 'zh', 'formal', 'gradual', 'Formal English, indirect style', 'Never confront directly. Frame all negotiation as mutual benefit. "We will consider" usually means no — probe gently. Patience signals respect.'),
('China Cantonese', 'zh', 'relationship-first', 'gradual', 'English with Cantonese business formality', 'Build rapport first. Ask one question about their business before price. Relationship unlocks better pricing more than pressure.'),
('Mexico', 'es', 'casual', 'gradual', 'Spanish-accented English, warm tone', 'Warm opener. Brief personal touch. Negotiate gradually. Patience and warmth signal respect more than urgency.'),
('Vietnam', 'vi', 'formal', 'direct', 'English with Vietnamese accent, sometimes fragmented', 'Formal and respectful. Speak clearly. Avoid idioms. Price clarity is valued. Be patient with responses.')
ON CONFLICT (region) DO NOTHING;

-- Demo completed RFQ with realistic data (for UI demo, NOT for live calls)
-- Note: Requires a real user_id to be inserted. Run these AFTER creating a user.
DO $$
DECLARE
  demo_user_id UUID;
  demo_rfq_id TEXT;
  call1_id TEXT;
  call2_id TEXT;
  call3_id TEXT;
  supplier1_id TEXT;
  supplier2_id TEXT;
  supplier3_id TEXT;
BEGIN
  -- These are placeholder IDs — replace with actual user UUID after auth setup
  demo_user_id := '00000000-0000-0000-0000-000000000000';

  -- Demo suppliers
  INSERT INTO suppliers (id, user_id, name, country, region, phone, email, contact_name, language_primary)
  VALUES (encode(gen_random_bytes(8), 'hex'), demo_user_id, 'Shenzhen Metalworks', 'China', 'China Mandarin', '+15551230001', 'wei.chen@szmetalworks.example.com', 'Wei Chen', 'zh')
  RETURNING id INTO supplier1_id;

  INSERT INTO suppliers (id, user_id, name, country, region, phone, email, contact_name, language_primary)
  VALUES (encode(gen_random_bytes(8), 'hex'), demo_user_id, 'Bangalore Precision Parts', 'India', 'South India', '+15551230002', 'priya@bangaloreprecision.example.com', 'Priya Nair', 'en')
  RETURNING id INTO supplier2_id;

  INSERT INTO suppliers (id, user_id, name, country, region, phone, email, contact_name, language_primary)
  VALUES (encode(gen_random_bytes(8), 'hex'), demo_user_id, 'Global Auto Components MX', 'Mexico', 'Mexico', '+15551230003', 'cmendoza@globalautomx.example.com', 'Carlos Mendoza', 'es')
  RETURNING id INTO supplier3_id;

  -- Demo RFQ
  INSERT INTO rfqs (id, user_id, part_name, specs, quantity, target_price, floor_price_enc, currency, deadline, aggressiveness, max_concessions, priority, status, completed_at)
  VALUES (encode(gen_random_bytes(8), 'hex'), demo_user_id, 'Aluminum Bumper Bracket', '{"material": "6061-T6 aluminum", "length_mm": 300, "width_mm": 80, "thickness_mm": 4, "finish": "powder coat black", "tolerance": "+/-0.5mm"}', 5000, 4.20, 'encrypted_demo_placeholder', 'USD', NOW() + INTERVAL '30 days', 'balanced', 2, 'price', 'completed', NOW())
  RETURNING id INTO demo_rfq_id;

  -- Link suppliers
  INSERT INTO rfq_suppliers (rfq_id, supplier_id) VALUES (demo_rfq_id, supplier1_id);
  INSERT INTO rfq_suppliers (rfq_id, supplier_id) VALUES (demo_rfq_id, supplier2_id);
  INSERT INTO rfq_suppliers (rfq_id, supplier_id) VALUES (demo_rfq_id, supplier3_id);

  -- Call 1 — Shenzhen (best)
  INSERT INTO calls (id, rfq_id, supplier_id, status, started_at, ended_at, duration_sec, transcript, quoted_price, lead_time_days, terms, price_score, communication_score, composite_score, recommended)
  VALUES (encode(gen_random_bytes(8), 'hex'), demo_rfq_id, supplier1_id, 'completed', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '50 minutes', 623,
    'Agent: Just to let you know, this call is handled by an AI procurement assistant calling on behalf of our team. I''m calling about a purchase inquiry for Aluminum Bumper Bracket, 5000 units. Do you have a moment?
Supplier: Yes, I can help. This is Wei Chen at Shenzhen Metalworks. Can you share the specs?
Agent: Certainly. We need 6061-T6 aluminum brackets, 300mm by 80mm, 4mm thickness, powder coat black finish. Quantity of 5000 units. What would be your best price?
Supplier: For 5000 units with powder coating, our price would be $4.35 per unit. Lead time about 20 days.
Agent: That''s above what we''ve budgeted. We were targeting closer to $4.00. Is there any flexibility on the price?
Supplier: Let me check... The steel prices have increased 18% this quarter, so margins are tight. Best I can do is $3.95 but that''s with 18 day lead time.
Agent: I appreciate that. I see LME data suggests aluminum prices have actually stabilized this month. Could you do $3.85?
Supplier: You''re well informed. Let me do $3.88, 18 days lead time. That''s our best for this spec.
Agent: So your best price for 5000 units is $3.88 per unit, lead time 18 days — correct?
Supplier: Correct. Payment terms net 30.
Agent: Thank you, Wei. Let me confirm. I''ll mark this down. So your best price for 5000 units is $3.88, lead time 18 days, net 30 — correct? Correct. Thank you for your time.',
    3.88, 18, '{"payment_terms": "net 30", "moq": 1000, "certifications": ["ISO 9001:2015"], "notes": "Price includes powder coating"}',
    0.576, 0.820, 0.649, TRUE)
  RETURNING id INTO call1_id;

  -- Call 2 — Bangalore
  INSERT INTO calls (id, rfq_id, supplier_id, status, started_at, ended_at, duration_sec, transcript, quoted_price, lead_time_days, terms, price_score, communication_score, composite_score, recommended)
  VALUES (encode(gen_random_bytes(8), 'hex'), demo_rfq_id, supplier2_id, 'completed', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '38 minutes', 441,
    'Agent: Just to let you know, this call is handled by an AI procurement assistant. I''m calling about Aluminum Bumper Bracket, 5000 units. Specs are on the RFQ.
Supplier: Hi, Priya Nair speaking. We can supply these. Our price is $4.05 per unit, 22 days lead time.
Agent: Thank you. The target is $4.00 — can you improve?
Supplier: For 5000, $4.05 is our standard. I can check if we could do $4.00 if you flex on lead time to 25 days.
Agent: We need it sooner than 25 days. $4.05 is acceptable. Can you confirm 22 days?
Supplier: Confirmed. Payment terms net 45.
Agent: So your best price for 5000 units is $4.05, lead time 22 days, net 45 — correct? Correct.',
    4.05, 22, '{"payment_terms": "net 45", "moq": 2000, "certifications": ["ISO 9001:2015", "IATF 16949"], "notes": ""}',
    0.464, 0.750, 0.550, FALSE)
  RETURNING id INTO call2_id;

  -- Call 3 — Mexico
  INSERT INTO calls (id, rfq_id, supplier_id, status, started_at, ended_at, duration_sec, transcript, quoted_price, lead_time_days, terms, price_score, communication_score, composite_score, recommended)
  VALUES (encode(gen_random_bytes(8), 'hex'), demo_rfq_id, supplier3_id, 'completed', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '25 minutes', 327,
    'Agent: Just to let you know, this call is handled by an AI procurement assistant calling on behalf of our team. I''m calling about Aluminum Bumper Bracket, 5000 units.
Supplier: Hola, Carlos Mendoza. Yes, we can make these. Price is $4.50 per unit with 14 day lead time. Very fast.
Agent: That is above our budget of $4.00. Can you improve the price?
Supplier: For 5000 units, $4.50 is already competitive. Maybe $4.40 if you order 10000.
Agent: We need 5000 for this order. $4.50 is too high.
Supplier: I understand. Best I can do is $4.50 and 14 days — fastest lead time of anyone.
Agent: I see. Thank you for the offer. Let me note that down. So $4.50, 14 days — correct?
Supplier: Correct. Payment net 30.',
    4.50, 14, '{"payment_terms": "net 30", "moq": 500, "certifications": ["ISO 9001:2015"], "notes": "Fastest lead time"}',
    0.357, 0.650, 0.445, FALSE)
  RETURNING id INTO call3_id;
END $$;
