import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Topbar } from "@/components/Topbar";
import {
  Copy, Eye, EyeOff, KeyRound, RefreshCw, Check, Plus, Trash2,
  Loader2, Zap, Send, ShieldX, AlertCircle, Globe, Code2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getApiKeys, createApiKey, revokeApiKey, rotateApiKey,
  getUsageStats, getWebhooks, createWebhook, deleteWebhook,
  getOrgSettings, saveOrgSettings,
} from "@/lib/api-client";
import type { ApiKey, WebhookEndpoint, UsageStats, OrgSettings } from "@/lib/api-client";
import { SetupBanner } from "@/components/SetupBanner";

export const Route = createFileRoute("/integrations")({
  component: IntegrationsPage,
  head: () => ({ meta: [{ title: "API & Integrations — SovereignGuard AI" }] }),
});

// ── Real API endpoint (same Worker, same origin) ──────────────────────────────
const API_BASE = typeof window !== "undefined"
  ? `${window.location.origin}/v1`
  : "https://sovereign-guard-ai.gastonsoftwaresolutions234.workers.dev/v1";

// ── Code snippets — point at the real endpoint ────────────────────────────────
function buildSnippets(apiKey: string): Record<string, string> {
  const masked = apiKey || "YOUR_API_KEY";
  return {
    cURL: `curl -X POST ${API_BASE}/send-secure-notification \\
  -H "Authorization: Bearer ${masked}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipient_email": "patient@example.com",
    "policy_type": "hipaa",
    "notification_subtype": "lab_results",
    "raw_prompt_input": "Your lab results are ready for review.",
    "template_context": {
      "subject": "Lab Results Ready",
      "client_name": "Jane Doe"
    }
  }'`,

    JavaScript: `// npm install node-fetch  (or use native fetch in Node 18+)

const response = await fetch("${API_BASE}/send-secure-notification", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${masked}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    recipient_email: "patient@example.com",
    policy_type: "hipaa",
    notification_subtype: "lab_results",
    raw_prompt_input: "Your lab results are ready for review.",
    template_context: {
      subject: "Lab Results Ready",
      client_name: "Jane Doe",
    },
  }),
});

const result = await response.json();
console.log(result.transaction_id, result.status);`,

    Python: `import requests

response = requests.post(
    "${API_BASE}/send-secure-notification",
    headers={
        "Authorization": "Bearer ${masked}",
        "Content-Type": "application/json",
    },
    json={
        "recipient_email": "billing@acme.co",
        "policy_type": "soc2",
        "notification_subtype": "invoice",
        "raw_prompt_input": "Invoice #INV-4021 for $2,400 is due.",
        "template_context": {
            "subject": "Invoice Due",
            "client_name": "Acme Corp",
        },
    },
)

data = response.json()
print(data["transaction_id"], data["status"])`,

    PHP: `<?php
$response = file_get_contents("${API_BASE}/send-secure-notification", false,
  stream_context_create([
    "http" => [
      "method"  => "POST",
      "header"  => implode("\\r\\n", [
        "Authorization: Bearer ${masked}",
        "Content-Type: application/json",
      ]),
      "content" => json_encode([
        "recipient_email"      => "ops@company.com",
        "policy_type"          => "security",
        "notification_subtype" => "alert",
        "raw_prompt_input"     => "Unusual login detected on your account.",
        "template_context"     => [
          "subject"     => "Security Alert",
          "client_name" => "John Smith",
        ],
      ]),
    ],
  ])
);
$data = json_decode($response, true);
echo $data["transaction_id"] . " " . $data["status"];`,
  };
}

// ── New Key Modal ─────────────────────────────────────────────────────────────

function NewKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: ApiKey) => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<string[]>(["dispatch", "policy:read"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const allScopes = ["dispatch", "policy:read", "policy:write", "audit:read", "team:read"];

  const toggleScope = (s: string) =>
    setScope((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const submit = async () => {
    if (!name.trim()) { setError("Key name is required"); return; }
    setLoading(true); setError(null);
    try {
      const res = await createApiKey({ name: name.trim(), scope });
      setNewKey(res.key);
      onCreated(res.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!newKey?.key) return;
    navigator.clipboard?.writeText(newKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={!newKey ? onClose : undefined} />
      <div className="relative w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl p-6 space-y-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">
            {newKey ? "Key Created — Save It Now" : "Generate API Key"}
          </h3>
          {!newKey && (
            <button onClick={onClose} className="h-8 w-8 rounded-md border border-border hover:bg-surface-elevated flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {newKey ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              This is the only time the full key will be shown. Copy it now.
            </div>
            <div className="flex items-center gap-2 p-3 rounded-md bg-background border border-border font-mono text-xs break-all">
              <code className="flex-1">{newKey.key}</code>
              <button
                onClick={copy}
                className="shrink-0 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 flex items-center gap-1.5 transition"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition"
            >
              Done — I've saved the key
            </button>
          </div>
        ) : (
          <>
            {error && (
              <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">{error}</p>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Key Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production Backend"
                  className="mt-1.5 w-full h-10 px-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Scopes</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {allScopes.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleScope(s)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-mono border transition",
                        scope.includes(s)
                          ? "bg-primary/15 text-primary border-primary/40"
                          : "bg-surface text-muted-foreground border-border hover:text-foreground",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 h-10 rounded-md border border-border text-sm font-medium hover:bg-surface-elevated transition">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={loading}
                className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Generate Key
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Add Webhook Modal ─────────────────────────────────────────────────────────

function AddWebhookModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [url, setUrl] = useState("https://");
  const [event, setEvent] = useState("dispatch.all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!url.startsWith("https://")) { setError("URL must start with https://"); return; }
    setLoading(true); setError(null);
    try {
      await createWebhook({ event, url });
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add webhook");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl p-6 space-y-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Add Webhook</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-md border border-border hover:bg-surface-elevated flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Event</label>
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className="mt-1.5 w-full h-10 px-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="dispatch.all">dispatch.all — every event</option>
              <option value="dispatch.sent">dispatch.sent — delivered</option>
              <option value="dispatch.sanitized">dispatch.sanitized — redacted & sent</option>
              <option value="dispatch.blocked">dispatch.blocked — DPI blocked</option>
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Endpoint URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.com/hooks/sovereign"
              className="mt-1.5 w-full h-10 px-3 rounded-md bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-md border border-border text-sm font-medium hover:bg-surface-elevated transition">Cancel</button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            Add Webhook
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function IntegrationsPage() {
  const [keys, setKeys]           = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks]   = useState<WebhookEndpoint[]>([]);
  const [usage, setUsage]         = useState<UsageStats | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  // Settings form state
  const [geminiKey, setGeminiKey]   = useState("");
  const [qemailKey, setQemailKey]   = useState("");
  const [savingKeys, setSavingKeys] = useState(false);
  const [saveMsg, setSaveMsg]       = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied]       = useState<string | null>(null);
  const [actionId, setActionId]   = useState<string | null>(null);
  const [showNewKey, setShowNewKey]     = useState(false);
  const [showWebhook, setShowWebhook]   = useState(false);
  const [snippetTab, setSnippetTab]     = useState<string>("cURL");

  const fetchAll = useCallback(async () => {
    try {
      const [keysRes, hooksRes, usageRes, settingsRes] = await Promise.all([
        getApiKeys(),
        getWebhooks(),
        getUsageStats(),
        getOrgSettings(),
      ]);
      setKeys(keysRes.keys);
      setWebhooks(hooksRes.webhooks);
      setUsage(usageRes.usage);
      setOrgSettings(settingsRes.settings);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const copy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleSaveApiKeys = async () => {
    if (!geminiKey.trim() && !qemailKey.trim()) {
      setSaveMsg("Enter at least one API key to save.");
      return;
    }
    setSavingKeys(true); setSaveMsg(null);
    try {
      await saveOrgSettings({
        ...(geminiKey.trim() ? { gemini_api_key: geminiKey.trim() } : {}),
        ...(qemailKey.trim() ? { qemail_api_key: qemailKey.trim() } : {}),
      });
      setGeminiKey(""); setQemailKey("");
      setSaveMsg("Keys saved securely ✓");
      await fetchAll(); // refresh previews
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to save keys");
    } finally {
      setSavingKeys(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  const handleRevoke = async (key: ApiKey) => {
    setActionId(key.id);
    try {
      await revokeApiKey(key.id);
      setKeys((prev) => prev.map((k) => k.id === key.id ? { ...k, status: "revoked" } : k));
    } catch { /* ignore */ }
    finally { setActionId(null); }
  };

  const handleRotate = async (key: ApiKey) => {
    if (!confirm(`Rotate key "${key.name}"? The old key will stop working immediately.`)) return;
    setActionId(key.id);
    try {
      const res = await rotateApiKey(key.id);
      setKeys((prev) => prev.map((k) => k.id === key.id ? res.key : k));
      // Show the new key value once
      if (res.key.key) {
        copy(res.key.key, `rotated-${key.id}`);
        alert(`New key copied to clipboard:\n${res.key.key}\n\nSave it now — it won't be shown again.`);
      }
    } catch { /* ignore */ }
    finally { setActionId(null); }
  };

  const handleDeleteWebhook = async (hook: WebhookEndpoint) => {
    if (!confirm(`Remove webhook for ${hook.event}?`)) return;
    setActionId(hook.id);
    try {
      await deleteWebhook(hook.id);
      setWebhooks((prev) => prev.filter((h) => h.id !== hook.id));
    } catch { /* ignore */ }
    finally { setActionId(null); }
  };

  // Use the first active key for code snippets
  const activeKey = keys.find((k) => k.status === "active");
  const snippets = buildSnippets(activeKey?.key_preview ?? "sgai_live_••••••••••••••••••••••••••••••••");
  const snippetKeys = Object.keys(snippets);

  return (
    <>
      <Topbar title="API & Integrations" subtitle="Connect your app directly or use the dashboard — both routes go through the same trust layer" />
      <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-auto">

        {/* Usage stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <UsageStat label="Requests · 24h"  value={loading ? "…" : (usage?.requests_24h ?? 0).toLocaleString()} icon={Zap}     />
          <UsageStat label="Delivered · 24h" value={loading ? "…" : (usage?.delivered_24h ?? 0).toLocaleString()} icon={Send}    />
          <UsageStat label="Blocked · 24h"   value={loading ? "…" : (usage?.blocked_24h ?? 0).toLocaleString()}  icon={ShieldX} accent />
          <UsageStat label="Error Rate"       value={loading ? "…" : `${usage?.error_rate ?? 0}%`}               icon={AlertCircle} />
        </div>

        {/* Setup banner — shown when keys are missing */}
        {!loading && (
          <SetupBanner
            geminiConfigured={orgSettings?.gemini_configured ?? false}
            qemailConfigured={orgSettings?.qemail_configured ?? false}
          />
        )}

        {/* Service API Keys — per-org configuration */}
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-surface/60 to-surface backdrop-blur overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-border flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-base font-semibold">Your Service API Keys</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Connect your own Gemini and QEmail Smart Connect accounts. Lobster Trap DPI is shared infrastructure — no key needed.
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-5">
            {/* Status indicators */}
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                {
                  label: "Gemini API",
                  configured: orgSettings?.gemini_configured ?? false,
                  preview: orgSettings?.gemini_preview,
                  link: "https://aistudio.google.com/apikey",
                  linkLabel: "Get key →",
                  placeholder: "AIzaSy…",
                  value: geminiKey,
                  onChange: setGeminiKey,
                  hint: "Google AI Studio → Create API key (free tier available)",
                },
                {
                  label: "QEmail Smart Connect",
                  configured: orgSettings?.qemail_configured ?? false,
                  preview: orgSettings?.qemail_preview,
                  link: "https://smartconnect.gss-tec.com",
                  linkLabel: "Get key →",
                  placeholder: "qssn_live_…",
                  value: qemailKey,
                  onChange: setQemailKey,
                  hint: "QEmail Smart Connect dashboard → API Keys",
                },
              ].map((svc) => (
                <div key={svc.label} className="rounded-lg border border-border bg-background/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{svc.label}</p>
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                      svc.configured
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-warning/10 text-warning border-warning/30"
                    )}>
                      {svc.configured ? "✓ Configured" : "Not set"}
                    </span>
                  </div>
                  {svc.configured && svc.preview && (
                    <p className="text-[11px] font-mono text-muted-foreground bg-surface px-2 py-1 rounded border border-border">
                      {svc.preview}
                    </p>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {svc.configured ? "Update key" : "Enter key"}
                      </label>
                      <a href={svc.link} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline">{svc.linkLabel}</a>
                    </div>
                    <input
                      type="password"
                      value={svc.value}
                      onChange={(e) => svc.onChange(e.target.value)}
                      placeholder={svc.placeholder}
                      className="w-full h-9 px-3 rounded-md bg-background border border-border font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{svc.hint}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Lobster Trap — shared, no key needed */}
            <div className="rounded-lg border border-border bg-background/40 p-4 flex items-center gap-3">
              <span className="text-lg">🛡️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Lobster Trap DPI</p>
                <p className="text-[11px] text-muted-foreground">Shared infrastructure — no API key required. All organisations use the same Hugging Face Space.</p>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/30 shrink-0">
                ✓ Shared
              </span>
            </div>

            {/* Save button + feedback */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSaveApiKeys}
                disabled={savingKeys || (!geminiKey.trim() && !qemailKey.trim())}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition glow-emerald"
              >
                {savingKeys ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {savingKeys ? "Saving…" : "Save API Keys"}
              </button>
              {saveMsg && (
                <p className={cn(
                  "text-xs font-medium",
                  saveMsg.includes("✓") ? "text-primary" : "text-danger"
                )}>
                  {saveMsg}
                </p>
              )}
              {orgSettings?.updated_at && (
                <p className="text-[10px] text-muted-foreground ml-auto">
                  Last updated {new Date(orgSettings.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="rounded-xl border border-border bg-surface/60 backdrop-blur overflow-hidden">
          <div className="p-4 sm:p-6 flex items-center justify-between border-b border-border">
            <div className="flex items-start gap-4 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold">API Keys</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use these to authenticate requests from your application to the SovereignGuard gateway.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowNewKey(true)}
              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition"
            >
              <Plus className="h-3.5 w-3.5" /> New Key
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {keys.map((k) => (
                <div key={k.id} className={cn("p-4 sm:p-5 space-y-3", k.status === "revoked" && "opacity-50")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{k.name}</p>
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider",
                          k.status === "active"
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-muted text-muted-foreground border-border",
                        )}>
                          {k.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {k.scope.map((s: string) => (
                          <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-muted-foreground">{s}</span>
                        ))}
                      </div>
                    </div>
                    {k.status === "active" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {actionId === k.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <button
                              onClick={() => handleRotate(k)}
                              className="h-8 px-2.5 rounded-md border border-border hover:bg-surface-elevated text-xs font-medium flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition"
                              title="Rotate key"
                            >
                              <RefreshCw className="h-3.5 w-3.5" /> Rotate
                            </button>
                            <button
                              onClick={() => handleRevoke(k)}
                              className="h-8 w-8 rounded-md border border-border hover:bg-danger/10 hover:border-danger/40 hover:text-danger flex items-center justify-center text-muted-foreground transition"
                              title="Revoke key"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Key preview row */}
                  <div className="flex items-center gap-2 p-2.5 rounded-md bg-background border border-border font-mono text-xs">
                    <code className="flex-1 truncate text-muted-foreground">
                      {revealedKey === k.id ? k.key_preview : k.key_preview}
                    </code>
                    <button
                      onClick={() => setRevealedKey(revealedKey === k.id ? null : k.id)}
                      className="h-7 w-7 rounded hover:bg-surface-elevated flex items-center justify-center text-muted-foreground hover:text-foreground transition"
                    >
                      {revealedKey === k.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => copy(k.key_preview, k.id)}
                      className="h-7 px-2 rounded bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 flex items-center gap-1 transition"
                    >
                      {copied === k.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied === k.id ? "Copied" : "Copy"}
                    </button>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Created {new Date(k.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {k.last_used && ` · Last used ${new Date(k.last_used).toLocaleDateString()}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Code snippets */}
        <div className="rounded-xl border border-border bg-surface/60 backdrop-blur overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-chart-2/10 text-chart-2 flex items-center justify-center">
                <Code2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold">Quick Integration</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Drop this into your service — it calls the real gateway endpoint.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-md bg-background border border-border self-start">
              {snippetKeys.map((t) => (
                <button
                  key={t}
                  onClick={() => setSnippetTab(t)}
                  className={cn(
                    "px-3 py-1 rounded text-xs font-medium transition",
                    snippetTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <pre className="p-6 font-mono text-xs leading-relaxed text-foreground/90 overflow-x-auto bg-background/40 max-h-[360px]">
              {snippets[snippetTab]}
            </pre>
            <button
              onClick={() => copy(snippets[snippetTab], "snip")}
              className="absolute top-4 right-4 h-8 px-3 rounded-md bg-surface border border-border hover:bg-surface-elevated text-xs font-medium flex items-center gap-1.5 transition"
            >
              {copied === "snip" ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === "snip" ? "Copied" : "Copy"}
            </button>
          </div>
          {/* Endpoint reference */}
          <div className="px-6 py-3 border-t border-border bg-background/20 flex flex-wrap gap-x-6 gap-y-1">
            {[
              { method: "POST", path: "/v1/send-secure-notification", desc: "Send a notification" },
              { method: "GET",  path: "/v1/audit-logs",               desc: "Fetch audit trail" },
              { method: "GET",  path: "/v1/policies",                 desc: "List DPI rules" },
              { method: "GET",  path: "/v1/health",                   desc: "Liveness probe" },
            ].map((e) => (
              <div key={e.path} className="flex items-center gap-2 text-[10px]">
                <span className={cn(
                  "font-mono font-bold px-1.5 py-0.5 rounded",
                  e.method === "POST" ? "bg-primary/15 text-primary" : "bg-chart-2/15 text-chart-2",
                )}>
                  {e.method}
                </span>
                <code className="text-muted-foreground">{e.path}</code>
                <span className="text-muted-foreground/60">— {e.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Webhooks */}
        <div className="rounded-xl border border-border bg-surface/60 backdrop-blur overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold">Webhook Endpoints</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receive real-time delivery verdicts pushed to your own infrastructure.
              </p>
            </div>
            <button
              onClick={() => setShowWebhook(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-surface-elevated text-xs font-medium transition"
            >
              <Plus className="h-3.5 w-3.5" /> Add Endpoint
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : webhooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-fore):
            ground gap-2">
              <Globe className="h-8 w-8 opacity-30" />
              <p className="text-sm">No webhooks configured yet.</p>
              <p className="text-xs">Add an endpoint to receive real-time dispatch events.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {webhooks.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-4 sm:px-6 py-4">
                  <span className={cn(
                    "shrink-0 text-[10px] font-mono font-semibold px-2 py-0.5 rounded border",
                    h.event === "dispatch.blocked"
                      ? "bg-danger/10 text-danger border-danger/20"
                      : h.event === "dispatch.sanitized"
                      ? "bg-warning/10 text-warning border-warning/20"
                      : "bg-primary/10 text-primary border-primary/20",
                  )}>
                    {h.event}
                  </span>
                  <code className="text-xs font-mono text-muted-foreground flex-1 truncate">{h.url}</code>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      "h-2 w-2 rounded-full",
                      h.status === "active" ? "bg-primary" : "bg-muted-foreground",
                    )} />
                    {actionId === h.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <button
                        onClick={() => handleDeleteWebhook(h)}
                        className="h-7 w-7 rounded-md border border-border hover:bg-danger/10 hover:border-danger/40 hover:text-danger flex items-center justify-center text-muted-foreground transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Webhook payload reference */}
          <div className="px-6 py-4 border-t border-border bg-background/20">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Payload shape</p>
            <pre className="font-mono text-[10px] text-muted-foreground leading-relaxed">{`{
  "event":          "dispatch.sent",
  "transaction_id": "SGT-L8X9K2-A7B3C1",
  "timestamp":      "2026-05-12T09:00:00.000Z",
  "recipient":      "user@example.com",
  "policy_type":    "hipaa",
  "subtype":        "lab_results",
  "threat_score":   0.12,
  "status":         "delivered"
}`}</pre>
          </div>
        </div>

        {/* Hybrid mode explainer */}
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface/60 to-surface p-6 glow-emerald">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-base font-semibold">Hybrid Architecture</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                SovereignGuard supports two integration modes — use either or both simultaneously.
              </p>
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <div className="rounded-lg border border-border bg-surface/60 p-4">
                  <p className="text-xs font-semibold text-foreground mb-1">Dashboard Mode</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Use the Interactive Sandbox to compose and send notifications directly from this UI.
                    No code required — ideal for ops teams and one-off dispatches.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {["Sandbox", "Policy Manager", "Audit Logs", "Reports"].map((f) => (
                      <span key={f} className="text-[10px] px-2 py-0.5 rounded-md border border-border bg-background text-muted-foreground font-mono">{f}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-xs font-semibold text-foreground mb-1">API Mode</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Wire your backend directly to <code className="text-primary">POST /v1/send-secure-notification</code>.
                    Every request passes through the same DPI → Gemini → QSSN pipeline.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {["REST API", "API Keys", "Webhooks", "Audit Trail"].map((f) => (
                      <span key={f} className="text-[10px] px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-primary font-mono">{f}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {showNewKey && (
        <NewKeyModal
          onClose={() => setShowNewKey(false)}
          onCreated={(key) => setKeys((prev) => [...prev, key])}
        />
      )}
      {showWebhook && (
        <AddWebhookModal
          onClose={() => setShowWebhook(false)}
          onAdded={fetchAll}
        />
      )}
    </>
  );
}

function UsageStat({
  label, value, icon: Icon, accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4 backdrop-blur transition",
      accent ? "border-danger/30 bg-danger/5" : "border-border bg-surface/60",
    )}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <Icon className={cn("h-4 w-4", accent ? "text-danger" : "text-muted-foreground")} />
      </div>
      <p className={cn("font-display text-2xl font-semibold mt-2 tracking-tight", accent && "text-danger")}>{value}</p>
    </div>
  );
}

