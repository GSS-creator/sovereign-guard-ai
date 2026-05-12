CREATE TABLE IF NOT EXISTS org_settings (
  org_id          TEXT PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  gemini_api_key  TEXT,   -- encrypted at rest via AES-GCM
  qemail_api_key  TEXT,   -- encrypted at rest via AES-GCM
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
