/**
 * Audit Log Service
 *
 * Dual-write strategy:
 *  - D1  → primary store (queryable, filterable, paginated)
 *  - KV  → rolling index for fast recent-N lookups (fallback when D1 unavailable)
 *
 * Reads prefer D1 when available, fall back to KV.
 */

import type { AuditLogEntry, CloudflareEnv } from '../../types/api';
import { d1WriteAuditLog, d1ReadAuditLogs } from './d1';

const INDEX_KEY = 'audit:index';
const MAX_INDEX_SIZE = 500;

export async function writeAuditLog(
  env: CloudflareEnv,
  entry: AuditLogEntry,
): Promise<void> {
  // Write to D1 (primary)
  await d1WriteAuditLog(env, entry).catch((err) =>
    console.error('[Audit] D1 write failed:', err),
  );

  // Write to KV (fallback / fast index)
  const key = `audit:${entry.transaction_id}`;
  await env.SOVEREIGN_GUARD_KV.put(key, JSON.stringify(entry), {
    expirationTtl: 7_776_000,
  });

  // Update rolling KV index
  try {
    const raw = await env.SOVEREIGN_GUARD_KV.get(INDEX_KEY);
    const index: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    index.unshift(entry.transaction_id);
    if (index.length > MAX_INDEX_SIZE) index.length = MAX_INDEX_SIZE;
    await env.SOVEREIGN_GUARD_KV.put(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.error('[Audit] KV index update failed:', err);
  }
}

export async function readAuditLogs(
  env: CloudflareEnv,
  limit = 50,
  orgId?: string,
): Promise<AuditLogEntry[]> {
  // Prefer D1
  if (env.sovereign_guard_db) {
    const { logs } = await d1ReadAuditLogs(env, { limit, org_id: orgId });
    if (logs.length > 0) return logs;
  }

  // Fall back to KV (no org filtering in KV — dev mode only)
  const raw = await env.SOVEREIGN_GUARD_KV.get(INDEX_KEY);
  if (!raw) return [];

  const index = (JSON.parse(raw) as string[]).slice(0, limit);
  const entries = await Promise.all(
    index.map(async (id) => {
      const data = await env.SOVEREIGN_GUARD_KV.get(`audit:${id}`);
      return data ? (JSON.parse(data) as AuditLogEntry) : null;
    }),
  );
  return entries.filter((e): e is AuditLogEntry => e !== null);
}
