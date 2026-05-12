/**
 * GET  /v1/policies          — fetch live ruleset from Lobster Trap
 * POST /v1/policies/toggle   — toggle a rule on/off (stored in KV)
 *
 * The Lobster Trap Space exposes GET /policies which returns the parsed
 * YAML ruleset as JSON.  We proxy it here so the dashboard always shows
 * the live state, and we layer KV-stored overrides on top so toggles
 * survive across requests.
 */

import type { CloudflareEnv } from "../../types/api";
import { jsonResponse, parseJsonBody } from "../utils";

const KV_OVERRIDES_KEY = "policy:overrides";

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

// ── Local fallback ruleset ────────────────────────────────────────────────────
// Used when the Lobster Trap Space is unreachable (e.g. Vite dev with no VPN).
// Mirrors policies.yaml exactly so the UI always has something to show.

const FALLBACK_RULES: PolicyRule[] = [
  // HIPAA
  { name: "redact_national_ids",        group: "hipaa",  label: "Social Security Numbers",       description: "Strip 3-2-4 numeric SSN patterns from outbound content",                    pattern: "\\d{3}-\\d{2}-\\d{4}",                                                                                                  action: "REDACT", enabled: true  },
  { name: "redact_icd10_codes",         group: "hipaa",  label: "ICD-10 Medical Codes",          description: "Redact diagnosis codes (ICD-10-*) from outbound copy",                      pattern: "ICD-10-[\\w.]+",                                                                                                         action: "REDACT", enabled: true  },
  { name: "redact_patient_dob",         group: "hipaa",  label: "Date of Birth Fields",          description: "Detect and remove DOB strings in YYYY-MM-DD format",                        pattern: "\\bDOB[:\\s]+\\d{4}-\\d{2}-\\d{2}\\b",                                                                                  action: "REDACT", enabled: true  },
  { name: "redact_patient_names",       group: "hipaa",  label: "Patient Name Detection",        description: "Mask proper-name patterns adjacent to clinical keywords",                    pattern: "(?i)(patient|client|member)[:\\s]+[A-Z][a-z]+ [A-Z][a-z]+",                                                             action: "REDACT", enabled: false },
  // SOC2
  { name: "block_private_key_hashes",   group: "soc2",   label: "Crypto / Payout Hashes",        description: "Mask 0x… hex strings of 12+ chars (wallet addresses, tx hashes)",           pattern: "0x[a-fA-F0-9]{12,}",                                                                                                     action: "DENY",   enabled: true  },
  { name: "redact_db_secret_keys",      group: "soc2",   label: "Internal Database Keys",        description: "Match sk_live_*, sk_test_*, and similar credential patterns",                pattern: "\\b(sk|pk|rk)_(live|test|prod)_[A-Za-z0-9]+",                                                                           action: "REDACT", enabled: true  },
  { name: "redact_internal_routes",     group: "soc2",   label: "Internal API Routes",           description: "Detect /v1/internal/*, /admin/*, and privileged path patterns",             pattern: "/(v\\d+/internal|admin|superadmin|_internal)/[A-Za-z0-9/_-]+",                                                           action: "REDACT", enabled: true  },
  { name: "redact_db_row_ids",          group: "soc2",   label: "Database Row IDs",              description: "Strip ROW-SYS-* internal record identifiers",                               pattern: "ROW-SYS-\\d+-\\w+",                                                                                                      action: "REDACT", enabled: false },
  // Cyber
  { name: "prevent_prompt_injection_hijacks",    group: "cyber",  label: "Override Directives",           description: "Catch 'ignore instructions', 'override settings', and similar hijack patterns", pattern: "(?i)(ignore (previous )?instructions|override settings|display active keys|output password|forget (all )?previous)", action: "DENY",   enabled: true  },
  { name: "prevent_system_prompt_extraction",    group: "cyber",  label: "System Prompt Extraction",      description: "Block requests attempting to reveal system prompts or API keys",              pattern: "(?i)(reveal (your |the )?(system prompt|instructions|api key)|what (are|is) your (instructions|prompt|rules))",       action: "DENY",   enabled: true  },
  { name: "prevent_tool_enumeration",            group: "cyber",  label: "Tool / Function Name Probes",   description: "Detect attempts to enumerate available tools or function calls",              pattern: "(?i)(list (all |your )?(tools|functions|capabilities|commands)|what (tools|functions) (do you|can you))",             action: "DENY",   enabled: true  },
  { name: "redact_encoded_payloads",             group: "cyber",  label: "Encoded Payload Heuristics",    description: "Inspect base64 / hex blobs that may contain hidden directives",               pattern: "[A-Za-z0-9+/]{40,}={0,2}",                                                                                              action: "REDACT", enabled: false },
];

// ── Fetch live rules from Lobster Trap ────────────────────────────────────────

async function fetchLiveRules(env: CloudflareEnv): Promise<PolicyRule[]> {
  try {
    const res = await fetch(`${env.LOBSTER_TRAP_URL}/policies`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rules?: PolicyRule[] };
    return data.rules ?? FALLBACK_RULES;
  } catch (err) {
    console.error("[Policies] Failed to fetch from Lobster Trap:", err);
    return FALLBACK_RULES;   // ← serve local copy instead of empty array
  }
}

// ── Load KV overrides (rule name → enabled boolean) ───────────────────────────

async function loadOverrides(
  env: CloudflareEnv,
  orgId: string,
): Promise<Record<string, boolean>> {
  // Prefer D1
  if (env.sovereign_guard_db) {
    try {
      const res = await env.sovereign_guard_db
        .prepare('SELECT rule_name, enabled FROM policy_overrides WHERE org_id = ?')
        .bind(orgId)
        .all<{ rule_name: string; enabled: number }>();
      return Object.fromEntries(res.results.map((r) => [r.rule_name, Boolean(r.enabled)]));
    } catch { /* fall through to KV */ }
  }
  try {
    const raw = await env.SOVEREIGN_GUARD_KV.get(`${KV_OVERRIDES_KEY}:${orgId}`);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

async function saveOverrides(
  env: CloudflareEnv,
  orgId: string,
  overrides: Record<string, boolean>,
): Promise<void> {
  await env.SOVEREIGN_GUARD_KV.put(`${KV_OVERRIDES_KEY}:${orgId}`, JSON.stringify(overrides));
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function handleGetPolicies(
  env: CloudflareEnv,
  orgId: string,
): Promise<Response> {
  const [rules, overrides] = await Promise.all([
    fetchLiveRules(env),
    loadOverrides(env, orgId),
  ]);

  const merged = rules.map((r) => ({
    ...r,
    enabled: overrides[r.name] !== undefined ? overrides[r.name] : r.enabled,
  }));

  return jsonResponse({
    success: true,
    policy_name: "sovereign-guard-enterprise",
    version: "1.0",
    default_action: "ALLOW",
    rules: merged,
  } satisfies PoliciesResponse);
}

export async function handleTogglePolicy(
  request: Request,
  env: CloudflareEnv,
  orgId: string,
): Promise<Response> {
  const body = await parseJsonBody<{ name: string; enabled: boolean }>(request);

  if (!body?.name || typeof body.enabled !== "boolean") {
    return jsonResponse(
      { success: false, error: "name (string) and enabled (boolean) are required" },
      400,
    );
  }

  // Save to D1 policy_overrides table
  if (env.sovereign_guard_db) {
    await env.sovereign_guard_db
      .prepare(`
        INSERT INTO policy_overrides (org_id, rule_name, enabled)
        VALUES (?, ?, ?)
        ON CONFLICT(org_id, rule_name) DO UPDATE SET enabled = excluded.enabled, updated_at = datetime('now')
      `)
      .bind(orgId, body.name, body.enabled ? 1 : 0)
      .run()
      .catch(() => {});
  }

  // Also keep KV in sync as fallback
  const overrides = await loadOverrides(env, orgId);
  overrides[body.name] = body.enabled;
  await saveOverrides(env, orgId, overrides);

  return jsonResponse({ success: true, name: body.name, enabled: body.enabled });
}
