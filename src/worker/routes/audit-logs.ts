/**
 * GET /v1/audit-logs
 *
 * Returns the most recent audit log entries from KV.
 * Accepts an optional `?limit=N` query param (max 100, default 50).
 *
 * Used by the admin dashboard to populate the audit trail table.
 */

import type { CloudflareEnv } from '../../types/api';
import { readAuditLogs } from '../services/audit';
import { jsonResponse } from '../utils';

export async function handleAuditLogs(
  request: Request,
  env: CloudflareEnv,
  orgId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = Math.min(parseInt(limitParam ?? '50', 10) || 50, 100);

  const logs = await readAuditLogs(env, limit, orgId);

  return jsonResponse({
    success: true,
    count: logs.length,
    logs,
  });
}
