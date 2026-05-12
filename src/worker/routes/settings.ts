/**
 * Org Settings — API Key Management
 *
 * GET  /v1/settings   — get current settings (keys masked)
 * POST /v1/settings   — save/update API keys
 *
 * Keys are stored encrypted in D1 using AES-GCM with a per-org salt.
 * The encryption key is derived from the org_id + a Worker secret.
 * Raw keys are NEVER returned after saving — only masked previews.
 */

import type { CloudflareEnv } from '../../types/api';
import { jsonResponse, parseJsonBody } from '../utils';

// ── Encryption helpers (Web Crypto — available in Workers) ───────────────────

async function deriveKey(orgId: string, env: CloudflareEnv): Promise<CryptoKey> {
  // Use GEMINI_API_KEY as the base secret (it's a Worker secret, never exposed)
  // In production you'd add a dedicated ENCRYPTION_SECRET
  const secret = env.GEMINI_API_KEY || 'sovereign-guard-default-secret';
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(secret + orgId), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(orgId), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(text: string, key: CryptoKey): Promise<string> {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  const combined = new Uint8Array(iv.length + buf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(buf), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encoded: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv  = combined.slice(0, 12);
  const buf = combined.slice(12);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, buf);
  return new TextDecoder().decode(dec);
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 6) + '•'.repeat(Math.min(key.length - 10, 20)) + key.slice(-4);
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function handleGetSettings(
  env: CloudflareEnv,
  orgId: string,
): Promise<Response> {
  if (!env.sovereign_guard_db) {
    return jsonResponse({ success: true, settings: { gemini_configured: false, qemail_configured: false } });
  }

  const row = await env.sovereign_guard_db
    .prepare('SELECT gemini_api_key, qemail_api_key, updated_at FROM org_settings WHERE org_id = ?')
    .bind(orgId)
    .first<{ gemini_api_key: string | null; qemail_api_key: string | null; updated_at: string }>()
    .catch(() => null);

  if (!row) {
    return jsonResponse({
      success: true,
      settings: {
        gemini_configured: false,
        gemini_preview: null,
        qemail_configured: false,
        qemail_preview: null,
        updated_at: null,
      },
    });
  }

  // Decrypt to get previews (never return raw keys)
  const cryptoKey = await deriveKey(orgId, env).catch(() => null);
  let geminiPreview: string | null = null;
  let qemailPreview: string | null = null;

  if (cryptoKey) {
    if (row.gemini_api_key) {
      const raw = await decrypt(row.gemini_api_key, cryptoKey).catch(() => null);
      if (raw) geminiPreview = maskKey(raw);
    }
    if (row.qemail_api_key) {
      const raw = await decrypt(row.qemail_api_key, cryptoKey).catch(() => null);
      if (raw) qemailPreview = maskKey(raw);
    }
  }

  return jsonResponse({
    success: true,
    settings: {
      gemini_configured: !!row.gemini_api_key,
      gemini_preview: geminiPreview,
      qemail_configured: !!row.qemail_api_key,
      qemail_preview: qemailPreview,
      updated_at: row.updated_at,
    },
  });
}

export async function handleSaveSettings(
  request: Request,
  env: CloudflareEnv,
  orgId: string,
): Promise<Response> {
  const body = await parseJsonBody<{ gemini_api_key?: string; qemail_api_key?: string }>(request);
  if (!body) return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);

  if (!body.gemini_api_key?.trim() && !body.qemail_api_key?.trim()) {
    return jsonResponse({ success: false, error: 'At least one API key is required' }, 400);
  }

  if (!env.sovereign_guard_db) {
    return jsonResponse({ success: false, error: 'Database not available' }, 503);
  }

  const cryptoKey = await deriveKey(orgId, env);

  // Get existing values to preserve keys not being updated
  const existing = await env.sovereign_guard_db
    .prepare('SELECT gemini_api_key, qemail_api_key FROM org_settings WHERE org_id = ?')
    .bind(orgId)
    .first<{ gemini_api_key: string | null; qemail_api_key: string | null }>()
    .catch(() => null);

  const newGemini = body.gemini_api_key?.trim()
    ? await encrypt(body.gemini_api_key.trim(), cryptoKey)
    : existing?.gemini_api_key ?? null;

  const newQemail = body.qemail_api_key?.trim()
    ? await encrypt(body.qemail_api_key.trim(), cryptoKey)
    : existing?.qemail_api_key ?? null;

  await env.sovereign_guard_db
    .prepare(`
      INSERT INTO org_settings (org_id, gemini_api_key, qemail_api_key, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(org_id) DO UPDATE SET
        gemini_api_key = excluded.gemini_api_key,
        qemail_api_key = excluded.qemail_api_key,
        updated_at     = excluded.updated_at
    `)
    .bind(orgId, newGemini, newQemail)
    .run();

  return jsonResponse({ success: true, message: 'API keys saved securely' });
}

// ── Helper: load org's decrypted keys for use in the pipeline ─────────────────

export interface OrgKeys {
  gemini_api_key: string | null;
  qemail_api_key: string | null;
}

export async function loadOrgKeys(env: CloudflareEnv, orgId: string): Promise<OrgKeys> {
  if (!env.sovereign_guard_db) return { gemini_api_key: null, qemail_api_key: null };

  const row = await env.sovereign_guard_db
    .prepare('SELECT gemini_api_key, qemail_api_key FROM org_settings WHERE org_id = ?')
    .bind(orgId)
    .first<{ gemini_api_key: string | null; qemail_api_key: string | null }>()
    .catch(() => null);

  if (!row) return { gemini_api_key: null, qemail_api_key: null };

  const cryptoKey = await deriveKey(orgId, env).catch(() => null);
  if (!cryptoKey) return { gemini_api_key: null, qemail_api_key: null };

  const gemini = row.gemini_api_key
    ? await decrypt(row.gemini_api_key, cryptoKey).catch(() => null)
    : null;
  const qemail = row.qemail_api_key
    ? await decrypt(row.qemail_api_key, cryptoKey).catch(() => null)
    : null;

  return { gemini_api_key: gemini, qemail_api_key: qemail };
}
