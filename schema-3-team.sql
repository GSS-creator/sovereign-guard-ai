CREATE TABLE IF NOT EXISTS team_members (
  id         TEXT NOT NULL,
  org_id     TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS team_activity (
  id        TEXT NOT NULL,
  org_id    TEXT NOT NULL,
  who       TEXT NOT NULL,
  what      TEXT NOT NULL,
  target    TEXT NOT NULL,
  tone      TEXT NOT NULL DEFAULT 'primary',
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX IF NOT EXISTS idx_activity_org ON team_activity(org_id, timestamp DESC);
