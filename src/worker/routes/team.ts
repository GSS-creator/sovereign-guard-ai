/**
 * Team & Roles API — Multi-Tenant
 * All data is scoped by org_id.
 */

import type { CloudflareEnv } from '../../types/api';
import { jsonResponse, parseJsonBody } from '../utils';
import {
  d1GetMembers, d1UpsertMember, d1DeleteMember,
  d1AppendActivity, d1GetActivity,
} from '../services/d1';

export type Role = 'admin' | 'analyst' | 'developer' | 'viewer';
export type MemberStatus = 'active' | 'pending';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: MemberStatus;
  initials: string;
  last_seen: string;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  who: string;
  what: string;
  target: string;
  tone: 'primary' | 'warning' | 'chart';
  timestamp: string;
}

const PERMISSIONS = [
  { label: 'View dispatches & feed',  admin: true,  analyst: true,  developer: true,  viewer: true  },
  { label: 'Inspect raw payloads',    admin: true,  analyst: true,  developer: true,  viewer: false },
  { label: 'Edit policy rulesets',    admin: true,  analyst: true,  developer: false, viewer: false },
  { label: 'Rotate API keys',         admin: true,  analyst: false, developer: true,  viewer: false },
  { label: 'Manage integrations',     admin: true,  analyst: false, developer: true,  viewer: false },
  { label: 'Invite & remove members', admin: true,  analyst: false, developer: false, viewer: false },
  { label: 'Generate audit reports',  admin: true,  analyst: true,  developer: false, viewer: true  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `mbr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function getInitials(name: string): string {
  return name.split(' ').map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('');
}

function formatLastSeen(iso: string): string {
  if (!iso) return 'Invite sent';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return 'Active now';
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  if (diff < 172_800_000) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── D1 + KV dual-write helpers ────────────────────────────────────────────────

async function loadMembers(env: CloudflareEnv, orgId: string): Promise<TeamMember[]> {
  if (env.sovereign_guard_db) {
    const rows = await d1GetMembers(env, orgId);
    if (rows.length > 0) {
      return rows.map((m) => ({
        ...m,
        role: m.role as Role,
        status: m.status as MemberStatus,
        last_seen: m.last_seen ?? '',
      }));
    }
  }
  // KV fallback (dev mode)
  const raw = await env.SOVEREIGN_GUARD_KV.get(`team:members:${orgId}`);
  return raw ? JSON.parse(raw) as TeamMember[] : [];
}

async function saveMember(env: CloudflareEnv, orgId: string, member: TeamMember): Promise<void> {
  if (env.sovereign_guard_db) {
    await d1UpsertMember(env, orgId, { ...member, last_seen: member.last_seen || null }).catch(() => {});
  }
  // KV sync
  const all = await loadMembers(env, orgId);
  const idx = all.findIndex((m) => m.email === member.email);
  if (idx >= 0) all[idx] = member; else all.push(member);
  await env.SOVEREIGN_GUARD_KV.put(`team:members:${orgId}`, JSON.stringify(all));
}

async function deleteMember(env: CloudflareEnv, orgId: string, email: string): Promise<void> {
  if (env.sovereign_guard_db) {
    await d1DeleteMember(env, orgId, email).catch(() => {});
  }
  const all = await loadMembers(env, orgId);
  await env.SOVEREIGN_GUARD_KV.put(
    `team:members:${orgId}`,
    JSON.stringify(all.filter((m) => m.email !== email)),
  );
}

export async function appendActivity(
  env: CloudflareEnv,
  orgId: string,
  entry: Omit<ActivityEntry, 'id' | 'timestamp'>,
): Promise<void> {
  const id = generateId();
  if (env.sovereign_guard_db) {
    await d1AppendActivity(env, orgId, { ...entry, id }).catch(() => {});
  }
  const key = `team:activity:${orgId}`;
  const raw = await env.SOVEREIGN_GUARD_KV.get(key);
  const log: ActivityEntry[] = raw ? JSON.parse(raw) : [];
  log.unshift({ ...entry, id, timestamp: new Date().toISOString() });
  if (log.length > 100) log.length = 100;
  await env.SOVEREIGN_GUARD_KV.put(key, JSON.stringify(log));
}

async function loadActivity(env: CloudflareEnv, orgId: string): Promise<ActivityEntry[]> {
  if (env.sovereign_guard_db) {
    const rows = await d1GetActivity(env, orgId, 50).catch(() => []);
    if (rows.length > 0) return rows as ActivityEntry[];
  }
  const raw = await env.SOVEREIGN_GUARD_KV.get(`team:activity:${orgId}`);
  return raw ? JSON.parse(raw) : [];
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function handleGetMembers(env: CloudflareEnv, orgId: string): Promise<Response> {
  const members = await loadMembers(env, orgId);
  return jsonResponse({
    success: true,
    stats: {
      total:   members.length,
      active:  members.filter((m) => m.status === 'active').length,
      pending: members.filter((m) => m.status === 'pending').length,
      roles:   new Set(members.map((m) => m.role)).size,
    },
    members: members.map((m) => ({ ...m, last_seen_label: formatLastSeen(m.last_seen) })),
  });
}

export async function handleInviteMember(
  request: Request,
  env: CloudflareEnv,
  orgId: string,
): Promise<Response> {
  const body = await parseJsonBody<{ name: string; email: string; role: Role }>(request);
  if (!body?.name?.trim() || !body?.email?.trim() || !body?.role) {
    return jsonResponse({ success: false, error: 'name, email, and role are required' }, 400);
  }
  const validRoles: Role[] = ['admin', 'analyst', 'developer', 'viewer'];
  if (!validRoles.includes(body.role)) {
    return jsonResponse({ success: false, error: `role must be one of: ${validRoles.join(', ')}` }, 400);
  }

  const members = await loadMembers(env, orgId);
  if (members.find((m) => m.email === body.email.trim().toLowerCase())) {
    return jsonResponse({ success: false, error: 'A member with this email already exists' }, 409);
  }

  const newMember: TeamMember = {
    id: generateId(),
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    role: body.role,
    status: 'pending',
    initials: getInitials(body.name),
    last_seen: '',
    created_at: new Date().toISOString(),
  };

  await saveMember(env, orgId, newMember);
  await appendActivity(env, orgId, { who: 'System', what: 'invited', target: `${newMember.email} (${newMember.role})`, tone: 'primary' });
  return jsonResponse({ success: true, member: newMember }, 201);
}

export async function handleUpdateMember(
  request: Request,
  env: CloudflareEnv,
  orgId: string,
  email: string,
): Promise<Response> {
  const body = await parseJsonBody<{ role?: Role; status?: MemberStatus }>(request);
  if (!body) return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);

  const members = await loadMembers(env, orgId);
  const idx = members.findIndex((m) => m.email === decodeURIComponent(email));
  if (idx === -1) return jsonResponse({ success: false, error: 'Member not found' }, 404);

  const before = { ...members[idx] };
  if (body.role)   members[idx].role   = body.role;
  if (body.status) members[idx].status = body.status;
  await saveMember(env, orgId, members[idx]);

  if (body.role && body.role !== before.role) {
    await appendActivity(env, orgId, { who: 'Admin', what: 'changed role', target: `${members[idx].email} → ${body.role}`, tone: 'warning' });
  }
  return jsonResponse({ success: true, member: members[idx] });
}

export async function handleRemoveMember(
  env: CloudflareEnv,
  orgId: string,
  email: string,
): Promise<Response> {
  const members = await loadMembers(env, orgId);
  const member = members.find((m) => m.email === decodeURIComponent(email));
  if (!member) return jsonResponse({ success: false, error: 'Member not found' }, 404);

  await deleteMember(env, orgId, member.email);
  await appendActivity(env, orgId, { who: 'Admin', what: 'removed member', target: member.email, tone: 'warning' });
  return jsonResponse({ success: true });
}

export function handleGetPermissions(): Response {
  return jsonResponse({ success: true, permissions: PERMISSIONS });
}

export async function handleGetActivity(env: CloudflareEnv, orgId: string): Promise<Response> {
  const log = await loadActivity(env, orgId);
  return jsonResponse({ success: true, count: log.length, activity: log });
}
