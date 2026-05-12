CREATE TABLE IF NOT EXISTS policy_overrides (
  org_id     TEXT NOT NULL,
  rule_name  TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, rule_name)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT NOT NULL,
  org_id      TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS webhooks (
  id             TEXT NOT NULL,
  org_id         TEXT NOT NULL,
  event          TEXT NOT NULL,
  url            TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  last_triggered TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(org_id);

CREATE TABLE IF NOT EXISTS threat_pattern_hits (
  org_id    TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT,
  PRIMARY KEY (org_id, rule_name)
);

CREATE TABLE IF NOT EXISTS reports (
  id         TEXT NOT NULL,
  org_id     TEXT NOT NULL,
  framework  TEXT NOT NULL,
  date_range TEXT NOT NULL,
  format     TEXT NOT NULL DEFAULT 'json',
  status     TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX IF NOT EXISTS idx_reports_org ON reports(org_id, created_at DESC);
