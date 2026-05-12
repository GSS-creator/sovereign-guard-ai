/**
 * Auth Service — Multi-Tenant Organisation Authentication
 *
 * Handles: register, login, logout, session validation
 * Sessions are stored in D1 with a 30-day expiry.
 * Passwords are hashed with a simple PBKDF2 via Web Crypto (available in Workers).
 */

import type { CloudflareEnv } from '../../types/api';
import { jsonResponse } from '../utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  email: string;
  plan: string;
  status: string;
  created_at: string;
}

export interface Session {
  token: string;
  org_id: string;
  expires_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `org_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
  const salt = Uint8Array.from(parts[1].match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const hashHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex === parts[2];
}

// ── Session validation (called by gateway middleware) ─────────────────────────

export async function validateSession(
  env: CloudflareEnv,
  token: string,
): Promise<Organisation | null> {
  if (!env.sovereign_guard_db || !token) return null;

  const row = await env.sovereign_guard_db
    .prepare(`
      SELECT s.org_id, s.expires_at, o.id, o.name, o.slug, o.email, o.plan, o.status, o.created_at
      FROM sessions s
      JOIN organisations o ON o.id = s.org_id
      WHERE s.token = ? AND s.expires_at > datetime('now') AND o.status = 'active'
    `)
    .bind(token)
    .first<Organisation & { expires_at: string }>()
    .catch(() => null);

  if (!row) return null;

  // Update last_used async (don't await)
  env.sovereign_guard_db
    .prepare("UPDATE sessions SET last_used = datetime('now') WHERE token = ?")
    .bind(token)
    .run()
    .catch(() => {});

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    email: row.email,
    plan: row.plan,
    status: row.status,
    created_at: row.created_at,
  };
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function handleRegister(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (!env.sovereign_guard_db) {
    return jsonResponse({ success: false, error: 'Database not available' }, 503);
  }

  let body: { name?: string; email?: string; password?: string } | null = null;
  try { body = await request.json(); } catch { /* ignore */ }

  if (!body?.name?.trim() || !body?.email?.trim() || !body?.password) {
    return jsonResponse({ success: false, error: 'name, email, and password are required' }, 400);
  }

  if (body.password.length < 8) {
    return jsonResponse({ success: false, error: 'Password must be at least 8 characters' }, 400);
  }

  const email = body.email.trim().toLowerCase();

  // Check duplicate
  const existing = await env.sovereign_guard_db
    .prepare('SELECT id FROM organisations WHERE email = ?')
    .bind(email)
    .first()
    .catch(() => null);

  if (existing) {
    return jsonResponse({ success: false, error: 'An organisation with this email already exists' }, 409);
  }

  const id   = generateId();
  const slug = slugify(body.name.trim());
  const hash = await hashPassword(body.password);

  // Ensure slug uniqueness
  const slugExists = await env.sovereign_guard_db
    .prepare('SELECT id FROM organisations WHERE slug = ?')
    .bind(slug)
    .first()
    .catch(() => null);

  const finalSlug = slugExists ? `${slug}-${Date.now().toString(36)}` : slug;

  await env.sovereign_guard_db
    .prepare(`
      INSERT INTO organisations (id, name, slug, email, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(id, body.name.trim(), finalSlug, email, hash)
    .run();

  // Create initial session
  const token     = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();

  await env.sovereign_guard_db
    .prepare('INSERT INTO sessions (token, org_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, id, expiresAt)
    .run();

  // Seed the org's first admin team member
  await env.sovereign_guard_db
    .prepare(`
      INSERT OR IGNORE INTO team_members (id, org_id, name, email, role, status, initials, last_seen)
      VALUES (?, ?, ?, ?, 'admin', 'active', ?, datetime('now'))
    `)
    .bind(`mbr_${Date.now().toString(36)}`, id, body.name.trim(), email,
      body.name.trim().split(' ').map((p: string) => p[0]?.toUpperCase() ?? '').slice(0, 2).join(''))
    .run();

  return jsonResponse({
    success: true,
    token,
    expires_at: expiresAt,
    org: { id, name: body.name.trim(), slug: finalSlug, email, plan: 'free' },
  }, 201);
}

export async function handleLogin(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (!env.sovereign_guard_db) {
    return jsonResponse({ success: false, error: 'Database not available' }, 503);
  }

  let body: { email?: string; password?: string } | null = null;
  try { body = await request.json(); } catch { /* ignore */ }

  if (!body?.email || !body?.password) {
    return jsonResponse({ success: false, error: 'email and password are required' }, 400);
  }

  const email = body.email.trim().toLowerCase();

  const org = await env.sovereign_guard_db
    .prepare('SELECT * FROM organisations WHERE email = ? AND status = ?')
    .bind(email, 'active')
    .first<Organisation & { password_hash: string }>()
    .catch(() => null);

  if (!org) {
    return jsonResponse({ success: false, error: 'Invalid email or password' }, 401);
  }

  const valid = await verifyPassword(body.password, org.password_hash);
  if (!valid) {
    return jsonResponse({ success: false, error: 'Invalid email or password' }, 401);
  }

  const token     = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();

  await env.sovereign_guard_db
    .prepare('INSERT INTO sessions (token, org_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, org.id, expiresAt)
    .run();

  return jsonResponse({
    success: true,
    token,
    expires_at: expiresAt,
    org: { id: org.id, name: org.name, slug: org.slug, email: org.email, plan: org.plan },
  });
}

export async function handleLogout(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  const token = extractToken(request);
  if (token && env.sovereign_guard_db) {
    await env.sovereign_guard_db
      .prepare('DELETE FROM sessions WHERE token = ?')
      .bind(token)
      .run()
      .catch(() => {});
  }
  return jsonResponse({ success: true });
}

export async function handleGetMe(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  const token = extractToken(request);
  if (!token) return jsonResponse({ success: false, error: 'Not authenticated' }, 401);

  const org = await validateSession(env, token);
  if (!org) return jsonResponse({ success: false, error: 'Session expired or invalid' }, 401);

  return jsonResponse({ success: true, org });
}

export function extractToken(request: Request): string | null {
  const auth = request.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}
