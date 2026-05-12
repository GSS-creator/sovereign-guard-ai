/**
 * SovereignGuard AI — Frontend API Client
 *
 * All calls go to /v1/* which is handled by the Cloudflare Worker gateway
 * on the same origin — no CORS issues, no env vars needed in the browser.
 */

import type {
  SendSecureNotificationRequest,
  SendSecureNotificationResponse,
  AuditLogEntry,
} from "@/types/api";

// ── Token helpers (defined first — used by apiFetch) ─────────────────────────

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sg_token");
}

export function setAuthToken(token: string): void {
  localStorage.setItem("sg_token", token);
}

export function clearAuthToken(): void {
  localStorage.removeItem("sg_token");
  localStorage.removeItem("sg_org");
}

// ── Base fetch wrapper ────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/v1${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? `HTTP ${res.status}`,
      res.status,
      data,
    );
  }

  return data as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  email: string;
  plan: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  expires_at: string;
  org: OrgInfo;
}

// Token stored in localStorage — injected into every request by apiFetch above

export function getStoredOrg(): OrgInfo | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("sg_org");
  return raw ? JSON.parse(raw) as OrgInfo : null;
}

export function setStoredOrg(org: OrgInfo): void {
  localStorage.setItem("sg_org", JSON.stringify(org));
}

export function register(data: { name: string; email: string; password: string }): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(data) });
}

export function login(data: { email: string; password: string }): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(data) });
}

export function logout(): Promise<{ success: boolean }> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function getMe(): Promise<{ success: boolean; org: OrgInfo }> {
  return apiFetch("/auth/me");
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  bindings: {
    lobster_trap: boolean;
    qemail: boolean;
    gemini_key: boolean;
    qemail_token: boolean;
    kv: boolean;
  };
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}

// ── Send Secure Notification ──────────────────────────────────────────────────

export function sendSecureNotification(
  payload: SendSecureNotificationRequest,
): Promise<SendSecureNotificationResponse> {
  return apiFetch<SendSecureNotificationResponse>("/send-secure-notification", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

export interface AuditLogsResponse {
  success: boolean;
  count: number;
  logs: AuditLogEntry[];
}

export function getAuditLogs(limit = 50): Promise<AuditLogsResponse> {
  return apiFetch<AuditLogsResponse>(`/audit-logs?limit=${limit}`);
}

// ── Policies ──────────────────────────────────────────────────────────────────

export interface PolicyRule {
  name: string;
  group: "hipaa" | "soc2" | "cyber";
  label: string;
  description: string;
  pattern: string;
  action: "DENY" | "REDACT" | "ALLOW";
  deny_message?: string;
  enabled: boolean;
}

export interface PoliciesResponse {
  success: boolean;
  policy_name: string;
  version: string;
  default_action: string;
  rules: PolicyRule[];
}

export function getPolicies(): Promise<PoliciesResponse> {
  return apiFetch<PoliciesResponse>("/policies");
}

export function togglePolicy(name: string, enabled: boolean): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/policies/toggle", {
    method: "POST",
    body: JSON.stringify({ name, enabled }),
  });
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────

export interface DashboardStats {
  totalDispatches: number;
  blockedCount: number;
  sanitizedCount: number;
  deliveredCount: number;
  anonymizationRate: number;
  systemHealthy: boolean;
}

export function computeStats(logs: AuditLogEntry[]): DashboardStats {
  const total = logs.length;
  const blocked = logs.filter((l) => l.delivery_status === "blocked").length;
  const sanitized = logs.filter((l) => !l.dpi_passed && l.delivery_status !== "blocked").length;
  const delivered = logs.filter((l) => l.delivery_status === "delivered").length;
  const redacted = logs.filter((l) => l.dpi_passed && l.threat_score > 0).length;
  const rate = total > 0 ? Math.round(((delivered + redacted) / total) * 1000) / 10 : 0;
  return {
    totalDispatches: total,
    blockedCount: blocked,
    sanitizedCount: sanitized,
    deliveredCount: delivered,
    anonymizationRate: rate,
    systemHealthy: true,
  };
}

// ── Intelligence ──────────────────────────────────────────────────────────────

export interface ThreatVector {
  name: string;
  count: number;
  pct: number;
  tone: string;
}

export interface GeoEntry {
  country: string;
  code: string;
  count: number;
  pct: number;
}

export interface AdversarialPattern {
  hash: string;
  signature: string;
  seen: number;
  novelty: "known" | "evolving" | "novel";
}

export interface IntelligenceResponse {
  success: boolean;
  generated_at: string;
  headline: {
    intercepts_24h: number;
    detection_accuracy: number;
    median_latency_ms: number;
  };
  vectors: ThreatVector[];
  geo: GeoEntry[];
  patterns: AdversarialPattern[];
  learning_loop: {
    patterns_learned_7d: number;
    false_positive_rate: number;
    mean_accuracy_uplift: number;
    novel_attacks_caught: number;
  };
}

export function getIntelligence(): Promise<IntelligenceResponse> {
  return apiFetch<IntelligenceResponse>("/intelligence");
}

// ── Team ──────────────────────────────────────────────────────────────────────

export type Role = "admin" | "analyst" | "developer" | "viewer";
export type MemberStatus = "active" | "pending";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: MemberStatus;
  initials: string;
  last_seen: string;
  last_seen_label: string;
  created_at: string;
}

export interface TeamStats {
  total: number;
  active: number;
  pending: number;
  roles: number;
}

export interface TeamMembersResponse {
  success: boolean;
  stats: TeamStats;
  members: TeamMember[];
}

export interface Permission {
  label: string;
  admin: boolean;
  analyst: boolean;
  developer: boolean;
  viewer: boolean;
}

export interface ActivityEntry {
  id: string;
  who: string;
  what: string;
  target: string;
  tone: "primary" | "warning" | "chart";
  timestamp: string;
}

export function getTeamMembers(): Promise<TeamMembersResponse> {
  return apiFetch<TeamMembersResponse>("/team/members");
}

export function inviteMember(data: {
  name: string;
  email: string;
  role: Role;
}): Promise<{ success: boolean; member: TeamMember }> {
  return apiFetch("/team/members", { method: "POST", body: JSON.stringify(data) });
}

export function updateMember(
  email: string,
  data: { role?: Role; status?: MemberStatus },
): Promise<{ success: boolean; member: TeamMember }> {
  return apiFetch(`/team/members/${encodeURIComponent(email)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function removeMember(email: string): Promise<{ success: boolean }> {
  return apiFetch(`/team/members/${encodeURIComponent(email)}`, { method: "DELETE" });
}

export function getPermissions(): Promise<{ success: boolean; permissions: Permission[] }> {
  return apiFetch("/team/permissions");
}

export function getTeamActivity(): Promise<{
  success: boolean;
  count: number;
  activity: ActivityEntry[];
}> {
  return apiFetch("/team/activity");
}

// ── Integrations ──────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  key?: string;          // only present immediately after create/rotate
  key_preview: string;
  scope: string[];
  created_at: string;
  last_used?: string;
  status: "active" | "revoked";
}

export interface WebhookEndpoint {
  id: string;
  event: "dispatch.sent" | "dispatch.sanitized" | "dispatch.blocked" | "dispatch.all";
  url: string;
  status: "active" | "paused";
  created_at: string;
  last_triggered?: string;
}

export interface UsageStats {
  requests_24h: number;
  delivered_24h: number;
  blocked_24h: number;
  error_rate: number;
  requests_7d: number;
  avg_latency_ms: number;
  hourly: { hour: string; count: number }[];
}

export function getApiKeys(): Promise<{ success: boolean; keys: ApiKey[] }> {
  return apiFetch("/integrations/keys");
}

export function createApiKey(data: { name: string; scope?: string[] }): Promise<{ success: boolean; key: ApiKey }> {
  return apiFetch("/integrations/keys", { method: "POST", body: JSON.stringify(data) });
}

export function revokeApiKey(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/integrations/keys/${id}`, { method: "DELETE" });
}

export function rotateApiKey(id: string): Promise<{ success: boolean; key: ApiKey }> {
  return apiFetch(`/integrations/keys/${id}/rotate`, { method: "POST" });
}

export function getUsageStats(): Promise<{ success: boolean; usage: UsageStats }> {
  return apiFetch("/integrations/usage");
}

export function getWebhooks(): Promise<{ success: boolean; webhooks: WebhookEndpoint[] }> {
  return apiFetch("/integrations/webhooks");
}

export function createWebhook(data: { event: string; url: string }): Promise<{ success: boolean; webhook: WebhookEndpoint }> {
  return apiFetch("/integrations/webhooks", { method: "POST", body: JSON.stringify(data) });
}

export function deleteWebhook(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/integrations/webhooks/${id}`, { method: "DELETE" });
}

// ── Org Settings ──────────────────────────────────────────────────────────────

export interface OrgSettings {
  gemini_configured: boolean;
  gemini_preview: string | null;
  qemail_configured: boolean;
  qemail_preview: string | null;
  updated_at: string | null;
}

export function getOrgSettings(): Promise<{ success: boolean; settings: OrgSettings }> {
  return apiFetch('/settings');
}

export function saveOrgSettings(data: {
  gemini_api_key?: string;
  qemail_api_key?: string;
}): Promise<{ success: boolean; message: string }> {
  return apiFetch('/settings', { method: 'POST', body: JSON.stringify(data) });
}
