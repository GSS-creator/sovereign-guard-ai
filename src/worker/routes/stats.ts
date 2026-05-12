/**
 * GET /v1/stats
 *
 * Returns aggregated dashboard statistics derived from the KV audit log.
 * Used by the Security Console to populate the stat cards.
 */

import type { AuditLogEntry, CloudflareEnv } from "../../types/api";
import { readAuditLogs } from "../services/audit";
import { jsonResponse } from "../utils";

export async function handleStats(env: CloudflareEnv, orgId: string): Promise<Response> {
  const logs = await readAuditLogs(env, 500, orgId);

  const total = logs.length;
  const blocked = logs.filter((l) => l.delivery_status === "blocked").length;
  const delivered = logs.filter((l) => l.delivery_status === "delivered").length;
  const redacted = logs.filter(
    (l: AuditLogEntry) => l.dpi_passed && l.threat_score > 0,
  ).length;

  const anonymizationRate =
    total > 0 ? Math.round(((delivered + redacted) / total) * 1000) / 10 : 0;

  // Policy breakdown
  const byPolicy = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.policy_type] = (acc[l.policy_type] ?? 0) + 1;
    return acc;
  }, {});

  // Last 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = logs.filter((l) => new Date(l.timestamp).getTime() > cutoff);

  return jsonResponse({
    success: true,
    stats: {
      total_dispatches: total,
      blocked_count: blocked,
      delivered_count: delivered,
      redacted_count: redacted,
      anonymization_rate: anonymizationRate,
      by_policy: byPolicy,
      last_24h: {
        total: last24h.length,
        blocked: last24h.filter((l) => l.delivery_status === "blocked").length,
        delivered: last24h.filter((l) => l.delivery_status === "delivered").length,
      },
    },
  });
}
