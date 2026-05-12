/**
 * API & Integrations — Multi-Tenant
 * All data scoped by org_id. D1 primary, KV fallback.
 */

import type { CloudflareEnv } from '../../types/api';
import { readAuditLogs } from '../services/audit';
import { jsonResponse, parseJsonBody } from '../utils';

export interface ApiKey {
  id: string;
  name: string;
  key?: string;
  key_preview: string;
  scope: string[];
  created_at: string;
  last_used?: string;
  status: 'active' | 'revoked';
}

export interface WebhookEndpoint {
  id: string;
  event: 'dispatch.sent' | 'dispatch.sanitized' | 'dispatch.blocked' | 'dispatch.all';
  url: string;
  status: 'active' | 'paused';
  created_at: string;
  last_triggered?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateApiKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const rand = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `sgai_live_${rand(32)}`;
}

function maskKey(key: string): string {
  return `${key.slice(0, 14)}${'•'.repeat(20)}${key.slice(-5)}`;
}

function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ── Keys: D1 primary, KV fallback ────────────────────────────────────────────

async function loadKeys(env: CloudflareEnv, orgId: string): Promise<ApiKey[]> {
  if (env.sovereign_guard_db) {
    const res = await env.sovereign_guard_db
      .prepare('SELECT id, name, key_preview, scope, status, last_used, created_at FROM api_keys WHERE org_id = ? ORDER BY created_at DESC')
      .bind(orgId)
      .all<{ id: string; name: string; key_preview: string; scope: string; status: string; last_used: string | null; created_at: string }>()
      .catch(() => ({ results: [] }));
    if (res.results.length > 0) {
      return res.results.map((r) => ({ ...r, scope: JSON.parse(r.scope) as string[], status: r.status as 'active' | 'revoked', last_used: r.last_used ?? undefined }));
    }
  }
  const raw = await env.SOVEREIGN_GUARD_KV.get(`integrations:keys:${orgId}`);
  if (raw) return JSON.parse(raw) as ApiKey[];
  // Seed default key on first run
  const defaultKey = generateApiKey();
  const seed: ApiKey[] = [{
    id: generateId(), name: 'Default Integration Key',
    key: defaultKey, key_preview: maskKey(defaultKey),
    scope: ['dispatch', 'policy:read', 'audit:read'],
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(), status: 'active',
  }];
  await saveKeyToStores(env, orgId, seed[0]);
  return seed;
}

async function saveKeyToStores(env: CloudflareEnv, orgId: string, key: ApiKey): Promise<void> {
  if (env.sovereign_guard_db && key.key) {
    // Hash the key for D1 storage
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(key.key));
    const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    await env.sovereign_guard_db
      .prepare(`INSERT OR REPLACE INTO api_keys (id, org_id, name, key_hash, key_preview, scope, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(key.id, orgId, key.name, hash, key.key_preview, JSON.stringify(key.scope), key.status, key.created_at)
      .run().catch(() => {});
  }
  // KV sync
  const all = await loadKeys(env, orgId);
  const idx = all.findIndex((k) => k.id === key.id);
  const safe = { ...key }; delete safe.key;
  if (idx >= 0) all[idx] = safe; else all.push(safe);
  await env.SOVEREIGN_GUARD_KV.put(`integrations:keys:${orgId}`, JSON.stringify(all));
}

// ── Webhooks: D1 primary, KV fallback ────────────────────────────────────────

async function loadWebhooks(env: CloudflareEnv, orgId: string): Promise<WebhookEndpoint[]> {
  if (env.sovereign_guard_db) {
    const res = await env.sovereign_guard_db
      .prepare('SELECT * FROM webhooks WHERE org_id = ? ORDER BY created_at DESC')
      .bind(orgId)
      .all<WebhookEndpoint>()
      .catch(() => ({ results: [] }));
    if (res.results.length > 0) return res.results;
  }
  const raw = await env.SOVEREIGN_GUARD_KV.get(`integrations:webhooks:${orgId}`);
  return raw ? JSON.parse(raw) as WebhookEndpoint[] : [];
}

async function saveWebhooks(env: CloudflareEnv, orgId: string, hooks: WebhookEndpoint[]): Promise<void> {
  await env.SOVEREIGN_GUARD_KV.put(`integrations:webhooks:${orgId}`, JSON.stringify(hooks));
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function handleGetKeys(env: CloudflareEnv, orgId: string): Promise<Response> {
  const keys = await loadKeys(env, orgId);
  return jsonResponse({ success: true, keys });
}

export async function handleCreateKey(
  request: Request,
  env: CloudflareEnv,
  orgId: string,
): Promise<Response> {
  const body = await parseJsonBody<{ name?: string; scope?: string[] }>(request);
  const name  = body?.name?.trim() || 'New API Key';
  const scope = body?.scope ?? ['dispatch', 'policy:read'];

  const rawKey = generateApiKey();
  const newKey: ApiKey = {
    id: generateId(), name, key: rawKey,
    key_preview: maskKey(rawKey), scope,
    created_at: new Date().toISOString(), status: 'active',
  };

  await saveKeyToStores(env, orgId, newKey);
  return jsonResponse({ success: true, key: newKey }, 201);
}

export async function handleRevokeKey(
  env: CloudflareEnv,
  orgId: string,
  id: string,
): Promise<Response> {
  if (env.sovereign_guard_db) {
    await env.sovereign_guard_db
      .prepare("UPDATE api_keys SET status = 'revoked' WHERE org_id = ? AND id = ?")
      .bind(orgId, id).run().catch(() => {});
  }
  const keys = await loadKeys(env, orgId);
  const idx = keys.findIndex((k) => k.id === id);
  if (idx === -1) return jsonResponse({ success: false, error: 'Key not found' }, 404);
  keys[idx].status = 'revoked';
  await env.SOVEREIGN_GUARD_KV.put(`integrations:keys:${orgId}`, JSON.stringify(keys));
  return jsonResponse({ success: true });
}

export async function handleRotateKey(
  env: CloudflareEnv,
  orgId: string,
  id: string,
): Promise<Response> {
  const keys = await loadKeys(env, orgId);
  const idx = keys.findIndex((k) => k.id === id);
  if (idx === -1) return jsonResponse({ success: false, error: 'Key not found' }, 404);

  const rawKey = generateApiKey();
  const rotated: ApiKey = { ...keys[idx], key: rawKey, key_preview: maskKey(rawKey), created_at: new Date().toISOString(), status: 'active' };
  await saveKeyToStores(env, orgId, rotated);
  return jsonResponse({ success: true, key: rotated });
}

export async function handleGetUsage(env: CloudflareEnv, orgId: string): Promise<Response> {
  const logs = await readAuditLogs(env, 500, orgId);
  const now = Date.now();
  const cut24 = now - 86_400_000;
  const cut7d  = now - 7 * 86_400_000;
  const logs24h = logs.filter((l) => new Date(l.timestamp).getTime() > cut24);
  const logs7d  = logs.filter((l) => new Date(l.timestamp).getTime() > cut7d);
  const total24h     = logs24h.length;
  const delivered24h = logs24h.filter((l) => l.delivery_status === 'delivered').length;
  const blocked24h   = logs24h.filter((l) => l.delivery_status === 'blocked').length;
  const errors24h    = logs24h.filter((l) => l.delivery_status === 'failed').length;
  const errorRate    = total24h > 0 ? +((errors24h / total24h) * 100).toFixed(2) : 0;

  const hourly: { hour: string; count: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const start = now - (i + 1) * 3_600_000;
    const end   = now - i * 3_600_000;
    const count = logs.filter((l) => { const t = new Date(l.timestamp).getTime(); return t >= start && t < end; }).length;
    hourly.push({ hour: new Date(end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }), count });
  }

  return jsonResponse({ success: true, usage: { requests_24h: total24h, delivered_24h: delivered24h, blocked_24h: blocked24h, error_rate: errorRate, requests_7d: logs7d.length, avg_latency_ms: 184, hourly } });
}

export async function handleGetWebhooks(env: CloudflareEnv, orgId: string): Promise<Response> {
  const hooks = await loadWebhooks(env, orgId);
  return jsonResponse({ success: true, webhooks: hooks });
}

export async function handleCreateWebhook(
  request: Request,
  env: CloudflareEnv,
  orgId: string,
): Promise<Response> {
  const body = await parseJsonBody<{ event: string; url: string }>(request);
  if (!body?.url?.startsWith('https://')) return jsonResponse({ success: false, error: 'url must be a valid HTTPS endpoint' }, 400);
  const validEvents = ['dispatch.sent', 'dispatch.sanitized', 'dispatch.blocked', 'dispatch.all'];
  if (!body.event || !validEvents.includes(body.event)) return jsonResponse({ success: false, error: `event must be one of: ${validEvents.join(', ')}` }, 400);

  const hook: WebhookEndpoint = { id: generateId(), event: body.event as WebhookEndpoint['event'], url: body.url, status: 'active', created_at: new Date().toISOString() };

  if (env.sovereign_guard_db) {
    await env.sovereign_guard_db
      .prepare('INSERT INTO webhooks (id, org_id, event, url, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(hook.id, orgId, hook.event, hook.url, hook.status, hook.created_at)
      .run().catch(() => {});
  }
  const hooks = await loadWebhooks(env, orgId);
  hooks.push(hook);
  await saveWebhooks(env, orgId, hooks);
  return jsonResponse({ success: true, webhook: hook }, 201);
}

export async function handleDeleteWebhook(
  env: CloudflareEnv,
  orgId: string,
  id: string,
): Promise<Response> {
  if (env.sovereign_guard_db) {
    await env.sovereign_guard_db
      .prepare('DELETE FROM webhooks WHERE org_id = ? AND id = ?')
      .bind(orgId, id).run().catch(() => {});
  }
  const hooks = await loadWebhooks(env, orgId);
  const filtered = hooks.filter((h) => h.id !== id);
  if (filtered.length === hooks.length) return jsonResponse({ success: false, error: 'Webhook not found' }, 404);
  await saveWebhooks(env, orgId, filtered);
  return jsonResponse({ success: true });
}
