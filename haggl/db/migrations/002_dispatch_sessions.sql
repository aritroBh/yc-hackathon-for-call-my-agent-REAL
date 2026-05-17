BEGIN;

CREATE TABLE dispatch_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id          UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  status          TEXT NOT NULL,
  total_suppliers INTEGER NOT NULL DEFAULT 0,
  dispatched      INTEGER NOT NULL DEFAULT 0,
  completed       INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_dispatch_sessions_rfq ON dispatch_sessions(rfq_id);
CREATE INDEX idx_dispatch_sessions_org ON dispatch_sessions(organization_id);

CREATE TRIGGER trg_dispatch_sessions_updated_at
  BEFORE UPDATE ON dispatch_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE dispatch_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_dispatch_sessions ON dispatch_sessions FOR ALL USING (true) WITH CHECK (true);

COMMIT;
