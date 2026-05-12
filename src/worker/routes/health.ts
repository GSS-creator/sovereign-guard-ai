/**
 * GET /v1/health
 *
 * Lightweight liveness probe.  Returns the worker version, timestamp,
 * and a summary of which environment bindings are configured.
 */

import type { CloudflareEnv } from '../../types/api';
import { jsonResponse } from '../utils';

export function handleHealth(env: CloudflareEnv): Response {
  return jsonResponse({
    status: 'ok',
    service: 'SovereignGuard AI Gateway',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    bindings: {
      lobster_trap: !!env.LOBSTER_TRAP_URL,
      qemail: !!env.QEMAIL_API_URL,
      gemini_key: !!env.GEMINI_API_KEY,
      qemail_token: !!env.QEMAIL_AUTH_TOKEN,
      kv: !!env.SOVEREIGN_GUARD_KV,
    },
  });
}
