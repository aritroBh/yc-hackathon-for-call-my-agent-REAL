BEGIN;

CREATE TABLE queue_entries (
  call_id         UUID PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
  rfq_id          UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name   TEXT NOT NULL,
  phone           TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempt         INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 1,
  error           TEXT,
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  twilio_call_sid TEXT
);

CREATE INDEX idx_queue_entries_status ON queue_entries(status);
CREATE INDEX idx_queue_entries_priority ON queue_entries(status, priority DESC);

CREATE TRIGGER trg_queue_entries_updated_at
  BEFORE UPDATE ON queue_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_queue_entries ON queue_entries FOR ALL USING (true) WITH CHECK (true);

COMMIT;
