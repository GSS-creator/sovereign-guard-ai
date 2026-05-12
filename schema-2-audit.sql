CREATE TABLE IF NOT EXISTS audit_logs (
  transaction_id       TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL,
  timestamp            TEXT NOT NULL,
  recipient_email      TEXT NOT NULL,
  sender_id            TEXT NOT NULL,
  policy_type          TEXT NOT NULL,
  notification_subtype TEXT,
  dpi_passed           INTEGER NOT NULL DEFAULT 1,
  threat_score         REAL    NOT NULL DEFAULT 0,
  delivery_status      TEXT    NOT NULL,
  country              TEXT,
  city                 TEXT,
  error                TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_org       ON audit_logs(org_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_recipient ON audit_logs(org_id, recipient_email);
CREATE INDEX IF NOT EXISTS idx_audit_policy    ON audit_logs(org_id, policy_type);
CREATE INDEX IF NOT EXISTS idx_audit_status    ON audit_logs(org_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_audit_country   ON audit_logs(org_id, country);
