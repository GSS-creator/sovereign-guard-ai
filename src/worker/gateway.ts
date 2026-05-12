/**
 * SovereignGuard AI Gateway — Multi-Tenant Router
 *
 * Every /v1/* request is either:
 *  - Public  (auth endpoints) — no session required
 *  - Private (all others)     — requires valid Bearer token → resolves org_id
 *
 * The resolved org_id is injected into every handler so all data is
 * automatically scoped to the calling organisation.
 */

import type { CloudflareEnv } from '../types/api';
import { handleHealth } from './routes/health';
import { handleSendSecureNotification } from './routes/send-notification';
import { handleAuditLogs } from './routes/audit-logs';
import { handleStats } from './routes/stats';
import { handleInspect } from './routes/inspect';
import { handleGetPolicies, handleTogglePolicy } from './routes/policies';
import { handleIntelligence } from './routes/intelligence';
import {
  handleGetMembers, handleInviteMember, handleUpdateMember,
  handleRemoveMember, handleGetPermissions, handleGetActivity,
} from './routes/team';
import { handleGetSettings, handleSaveSettings } from './routes/settings';
import {
  handleGetKeys, handleCreateKey, handleRevokeKey, handleRotateKey,
  handleGetUsage, handleGetWebhooks, handleCreateWebhook, handleDeleteWebhook,
} from './routes/integrations';
import {
  handleRegister, handleLogin, handleLogout, handleGetMe,
  validateSession, extractToken,
} from './services/auth';
import { corsHeaders, jsonResponse } from './utils';

// ── Public routes (no auth required) ─────────────────────────────────────────
const PUBLIC_ROUTES = new Set([
  'POST /v1/auth/register',
  'POST /v1/auth/login',
  'GET  /v1/health',
]);

export async function handleGatewayRequest(
  request: Request,
  env: CloudflareEnv,
): Promise<Response | null> {
  const url      = new URL(request.url);
  const pathname = url.pathname;
  const method   = request.method;

  // ── CORS preflight ─────────────────────────────────────────────────────────
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (!pathname.startsWith('/v1/')) return null;

  // ── Auth routes (public) ───────────────────────────────────────────────────
  if (pathname === '/v1/auth/register' && method === 'POST') {
    return withCors(await handleRegister(request, env));
  }
  if (pathname === '/v1/auth/login' && method === 'POST') {
    return withCors(await handleLogin(request, env));
  }
  if (pathname === '/v1/auth/logout' && method === 'POST') {
    return withCors(await handleLogout(request, env));
  }
  if (pathname === '/v1/auth/me' && method === 'GET') {
    return withCors(await handleGetMe(request, env));
  }
  if (pathname === '/v1/health' && method === 'GET') {
    return withCors(handleHealth(env));
  }

  // ── Resolve org from session token ────────────────────────────────────────
  const token = extractToken(request);
  const org   = token ? await validateSession(env, token) : null;

  // In dev mode (no D1), use a fallback org_id so the app still works
  const orgId = org?.id ?? (env.sovereign_guard_db ? null : 'dev_org');

  if (!orgId) {
    return withCors(jsonResponse({ success: false, error: 'Authentication required. Please login or register.' }, 401));
  }

  // ── Private routes (all scoped by orgId) ──────────────────────────────────
  let response: Response;

  if (pathname === '/v1/send-secure-notification' && method === 'POST') {
    response = await handleSendSecureNotification(request, env, orgId);
  } else if (pathname === '/v1/audit-logs' && method === 'GET') {
    response = await handleAuditLogs(request, env, orgId);
  } else if (pathname === '/v1/stats' && method === 'GET') {
    response = await handleStats(env, orgId);
  } else if (pathname === '/v1/inspect' && method === 'POST') {
    response = await handleInspect(request, env);
  } else if (pathname === '/v1/policies' && method === 'GET') {
    response = await handleGetPolicies(env, orgId);
  } else if (pathname === '/v1/policies/toggle' && method === 'POST') {
    response = await handleTogglePolicy(request, env, orgId);
  } else if (pathname === '/v1/intelligence' && method === 'GET') {
    response = await handleIntelligence(env, orgId);
  // Team
  } else if (pathname === '/v1/team/members' && method === 'GET') {
    response = await handleGetMembers(env, orgId);
  } else if (pathname === '/v1/team/members' && method === 'POST') {
    response = await handleInviteMember(request, env, orgId);
  } else if (pathname.startsWith('/v1/team/members/') && method === 'PUT') {
    response = await handleUpdateMember(request, env, orgId, pathname.replace('/v1/team/members/', ''));
  } else if (pathname.startsWith('/v1/team/members/') && method === 'DELETE') {
    response = await handleRemoveMember(env, orgId, pathname.replace('/v1/team/members/', ''));
  } else if (pathname === '/v1/team/permissions' && method === 'GET') {
    response = handleGetPermissions();
  } else if (pathname === '/v1/team/activity' && method === 'GET') {
    response = await handleGetActivity(env, orgId);
  // Settings
  } else if (pathname === '/v1/settings' && method === 'GET') {
    response = await handleGetSettings(env, orgId);
  } else if (pathname === '/v1/settings' && method === 'POST') {
    response = await handleSaveSettings(request, env, orgId);
  // Integrations
  } else if (pathname === '/v1/integrations/keys' && method === 'GET') {
    response = await handleGetKeys(env, orgId);
  } else if (pathname === '/v1/integrations/keys' && method === 'POST') {
    response = await handleCreateKey(request, env, orgId);
  } else if (pathname.startsWith('/v1/integrations/keys/') && pathname.endsWith('/rotate') && method === 'POST') {
    response = await handleRotateKey(env, orgId, pathname.replace('/v1/integrations/keys/', '').replace('/rotate', ''));
  } else if (pathname.startsWith('/v1/integrations/keys/') && method === 'DELETE') {
    response = await handleRevokeKey(env, orgId, pathname.replace('/v1/integrations/keys/', ''));
  } else if (pathname === '/v1/integrations/usage' && method === 'GET') {
    response = await handleGetUsage(env, orgId);
  } else if (pathname === '/v1/integrations/webhooks' && method === 'GET') {
    response = await handleGetWebhooks(env, orgId);
  } else if (pathname === '/v1/integrations/webhooks' && method === 'POST') {
    response = await handleCreateWebhook(request, env, orgId);
  } else if (pathname.startsWith('/v1/integrations/webhooks/') && method === 'DELETE') {
    response = await handleDeleteWebhook(env, orgId, pathname.replace('/v1/integrations/webhooks/', ''));
  } else {
    response = jsonResponse({ success: false, error: `Route not found: ${method} ${pathname}` }, 404);
  }

  return withCors(response);
}

function withCors(response: Response): Response {
  const cors = corsHeaders();
  Object.entries(cors).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}
