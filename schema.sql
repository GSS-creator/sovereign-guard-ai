-- ============================================================
-- SovereignGuard AI — Multi-Tenant D1 Schema v2
-- Every table is scoped by org_id for full tenant isolation.
-- ============================================================

-- ── Organisations (tenants) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,        -- used in API paths & display
  email         TEXT NOT NULL UNIQUE,        -- owner / billing email
  password_hash TEXT NOT NULL,               -- bcrypt hash
  plan          TEXT NOT NULL DEFAULT 'free', -- free | pro | enterprise
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orgs_email  ON organisations(email);
CREATE INDEX IF NOT EXISTS idx_orgs_slug   ON organisations(slug);
CREATE INDEX IF NOT EXISTS idx_orgs_status ON organisations(status);

-- ── Sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,               -- opaque random token (32 bytes hex)
  org_id     TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_used  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_org     ON sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── Audit Logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  transaction_id       TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
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

-- ── Team Members ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id         TEXT NOT NULL,
  org_id     TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'viewer',
  status     TEXT NOT NULL DEFAULT 'pending',
  initials   TEXT NOT NULL,
  last_seen  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_team_org    ON team_members(org_id);
CREATE INDEX IF NOT EXISTS idx_team_email  ON team_members(email);
CREATE INDEX IF NOT EXISTS idx_team_status ON team_members(org_id, status);

-- ── Team Activity Log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_activity (
  id        TEXT NOT NULL,
  org_id    TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  who       TEXT NOT NULL,
  what      TEXT NOT NULL,
  target    TEXT NOT NULL,
  tone      TEXT NOT NULL DEFAULT 'primary',
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_activity_org ON team_activity(org_id, timestamp DESC);

-- ── Policy Overrides ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_overrides (
  org_id     TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  rule_name  TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, rule_name)
);

-- ── API Keys ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  key_preview TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT '["dispatch","policy:read"]',
  status      TEXT NOT NULL DEFAULT 'active',
  last_used   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_keys_org    ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_keys_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_keys_status ON api_keys(org_id, status);

-- ── Webhook Endpoints ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id               TEXT NOT NULL,
  org_id           TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  event            TEXT NOT NULL,
  url              TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  last_triggered   TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(org_id);

-- ── Intelligence / Threat Patterns ───────────────────────────────────────────
-- Stores per-org pattern hit counts for the Intelligence tab
CREATE TABLE IF NOT EXISTS threat_pattern_hits (
  org_id      TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  rule_name   TEXT NOT NULL,
  hit_count   INTEGER NOT NULL DEFAULT 0,
  last_seen   TEXT,
  PRIMARY KEY (org_id, rule_name)
);

CREATE INDEX IF NOT EXISTS idx_threats_org ON threat_pattern_hits(org_id);

-- ── Reports ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  framework   TEXT NOT NULL,
  date_range  TEXT NOT NULL,
  format      TEXT NOT NULL DEFAULT 'json',
  status      TEXT NOT NULL DEFAULT 'ready',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_reports_org ON reports(org_id, created_at DESC);
