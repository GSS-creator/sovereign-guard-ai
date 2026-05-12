/**
 * D1 Database Service
 *
 * All SQL queries go through this module.
 * D1 handles: audit_logs, team_members, team_activity, api_keys
 * KV handles:  policy overrides, webhooks, integrations config (simple k/v)
 *
 * Falls back gracefully when D1 is unavailable (e.g. Vite dev mode).
 */

import type { AuditLogEntry, CloudflareEnv } from '../../types/api';

// ── Type helpers ──────────────────────────────────────────────────────────────

function hasD1(env: CloudflareEnv): boolean {
  return !!env.sovereign_guard_db;
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

export async function d1WriteAuditLog(
  env: CloudflareEnv,
  entry: AuditLogEntry,
): Promise<void> {
  if (!hasD1(env)) return;
  await env.sovereign_guard_db
    .prepare(`
      INSERT OR REPLACE INTO audit_logs
        (transaction_id, timestamp, recipient_email, sender_id,
         policy_type, notification_subtype, dpi_passed, threat_score,
         delivery_status, country, city, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      entry.transaction_id,
      entry.timestamp,
      entry.recipient_email,
      entry.sender_id,
      entry.policy_type,
      entry.notification_subtype ?? null,
      entry.dpi_passed ? 1 : 0,
      entry.threat_score,
      entry.delivery_status,
      entry.country ?? null,
      entry.city ?? null,
      entry.error ?? null,
    )
    .run();
}

export interface AuditLogFilter {
  limit?: number;
  offset?: number;
  org_id?: string;
  policy_type?: string;
  delivery_status?: string;
  recipient_email?: string;
  from_date?: string;
  to_date?: string;
}

export async function d1ReadAuditLogs(
  env: CloudflareEnv,
  filter: AuditLogFilter = {},
): Promise<{ logs: AuditLogEntry[]; total: number }> {
  if (!hasD1(env)) return { logs: [], total: 0 };

  const {
    limit = 50,
    offset = 0,
    org_id,
    policy_type,
    delivery_status,
    recipient_email,
    from_date,
    to_date,
  } = filter;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (org_id)          { conditions.push('org_id = ?');           params.push(org_id); }
  if (policy_type)     { conditions.push('policy_type = ?');      params.push(policy_type); }
  if (delivery_status) { conditions.push('delivery_status = ?');  params.push(delivery_status); }
  if (recipient_email) { conditions.push('recipient_email LIKE ?'); params.push(`%${recipient_email}%`); }
  if (from_date)       { conditions.push('timestamp >= ?');       params.push(from_date); }
  if (to_date)         { conditions.push('timestamp <= ?');       params.push(to_date); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataRes, countRes] = await env.sovereign_guard_db.batch<AuditLogEntry>([
    env.sovereign_guard_db
      .prepare(`SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset),
    env.sovereign_guard_db
      .prepare(`SELECT COUNT(*) as count FROM audit_logs ${where}`)
      .bind(...params),
  ]);

  const total = (countRes.results[0] as unknown as { count: number })?.count ?? 0;

  return {
    logs: dataRes.results.map((r) => ({ ...r, dpi_passed: Boolean(r.dpi_passed) })),
    total,
  };
}

export async function d1GetAuditStats(env: CloudflareEnv) {
  if (!hasD1(env)) return null;

  const now = new Date();
  const cut24h = new Date(now.getTime() - 86_400_000).toISOString();
  const cut7d  = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [stats24h, stats7d, byPolicy, byCountry] = await env.sovereign_guard_db.batch([
    env.sovereign_guard_db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status = 'blocked'   THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN delivery_status = 'failed'    THEN 1 ELSE 0 END) as failed,
        AVG(threat_score) as avg_threat_score
      FROM audit_logs WHERE timestamp >= ?
    `).bind(cut24h),

    env.sovereign_guard_db.prepare(`
      SELECT COUNT(*) as total FROM audit_logs WHERE timestamp >= ?
    `).bind(cut7d),

    env.sovereign_guard_db.prepare(`
      SELECT policy_type, COUNT(*) as count
      FROM audit_logs WHERE timestamp >= ?
      GROUP BY policy_type ORDER BY count DESC
    `).bind(cut24h),

    env.sovereign_guard_db.prepare(`
      SELECT country, COUNT(*) as count
      FROM audit_logs
      WHERE country IS NOT NULL AND country != 'XX' AND timestamp >= ?
      GROUP BY country ORDER BY count DESC LIMIT 10
    `).bind(cut7d),
  ]);

  return {
    last_24h: stats24h.results[0],
    last_7d_total: (stats7d.results[0] as { total: number })?.total ?? 0,
    by_policy: byPolicy.results,
    by_country: byCountry.results,
  };
}

// ── Team Members ──────────────────────────────────────────────────────────────

export interface D1TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  initials: string;
  last_seen: string | null;
  created_at: string;
}

export async function d1GetMembers(env: CloudflareEnv, orgId: string): Promise<D1TeamMember[]> {
  if (!hasD1(env)) return [];
  const res = await env.sovereign_guard_db
    .prepare('SELECT * FROM team_members WHERE org_id = ? ORDER BY created_at ASC')
    .bind(orgId)
    .all<D1TeamMember>();
  return res.results;
}

export async function d1UpsertMember(
  env: CloudflareEnv,
  orgId: string,
  member: D1TeamMember,
): Promise<void> {
  if (!hasD1(env)) return;
  await env.sovereign_guard_db
    .prepare(`
      INSERT INTO team_members (id, org_id, name, email, role, status, initials, last_seen, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(org_id, email) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        status = excluded.status,
        last_seen = excluded.last_seen
    `)
    .bind(
      member.id, orgId, member.name, member.email, member.role,
      member.status, member.initials, member.last_seen ?? null, member.created_at,
    )
    .run();
}

export async function d1DeleteMember(env: CloudflareEnv, orgId: string, email: string): Promise<void> {
  if (!hasD1(env)) return;
  await env.sovereign_guard_db
    .prepare('DELETE FROM team_members WHERE org_id = ? AND email = ?')
    .bind(orgId, email)
    .run();
}

// ── Team Activity ─────────────────────────────────────────────────────────────

export interface D1ActivityEntry {
  id: string;
  who: string;
  what: string;
  target: string;
  tone: string;
  timestamp: string;
}

export async function d1AppendActivity(
  env: CloudflareEnv,
  orgId: string,
  entry: Omit<D1ActivityEntry, 'timestamp'>,
): Promise<void> {
  if (!hasD1(env)) return;
  await env.sovereign_guard_db
    .prepare(`INSERT INTO team_activity (id, org_id, who, what, target, tone) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(entry.id, orgId, entry.who, entry.what, entry.target, entry.tone)
    .run();
}

export async function d1GetActivity(
  env: CloudflareEnv,
  orgId: string,
  limit = 50,
): Promise<D1ActivityEntry[]> {
  if (!hasD1(env)) return [];
  const res = await env.sovereign_guard_db
    .prepare('SELECT * FROM team_activity WHERE org_id = ? ORDER BY timestamp DESC LIMIT ?')
    .bind(orgId, limit)
    .all<D1ActivityEntry>();
  return res.results;
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export interface D1ApiKey {
  id: string;
  name: string;
  key_hash: string;
  key_preview: string;
  scope: string;   // JSON string
  status: string;
  last_used: string | null;
  created_at: string;
}

export async function d1GetApiKeys(env: CloudflareEnv): Promise<D1ApiKey[]> {
  if (!hasD1(env)) return [];
  const res = await env.sovereign_guard_db
    .prepare('SELECT * FROM api_keys ORDER BY created_at DESC')
    .all<D1ApiKey>();
  return res.results;
}

export async function d1InsertApiKey(env: CloudflareEnv, key: D1ApiKey): Promise<void> {
  if (!hasD1(env)) return;
  await env.sovereign_guard_db
    .prepare(`
      INSERT INTO api_keys (id, name, key_hash, key_preview, scope, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(key.id, key.name, key.key_hash, key.key_preview, key.scope, key.status, key.created_at)
    .run();
}

export async function d1UpdateApiKeyStatus(
  env: CloudflareEnv,
  id: string,
  status: string,
): Promise<void> {
  if (!hasD1(env)) return;
  await env.sovereign_guard_db
    .prepare('UPDATE api_keys SET status = ? WHERE id = ?')
    .bind(status, id)
    .run();
}

export async function d1UpdateApiKeyLastUsed(
  env: CloudflareEnv,
  id: string,
): Promise<void> {
  if (!hasD1(env)) return;
  await env.sovereign_guard_db
    .prepare("UPDATE api_keys SET last_used = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
}
