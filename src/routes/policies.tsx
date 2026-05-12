import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Topbar } from "@/components/Topbar";
import {
  HeartPulse, Lock, ShieldAlert, Stethoscope, Briefcase,
  Bell, FileText, CreditCard, Loader2, RefreshCw, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPolicies, togglePolicy } from "@/lib/api-client";
import type { PolicyRule } from "@/lib/api-client";

export const Route = createFileRoute("/policies")({
  component: PoliciesPage,
  head: () => ({ meta: [{ title: "Policy Manager — SovereignGuard AI" }] }),
});

// ── Static notification categories (UI only) ──────────────────────────────────

const notificationCategories = [
  {
    title: "Payment Notifications",
    desc: "Receipts, invoices, billing reminders, payout confirmations & subscription alerts.",
    icon: CreditCard,
    accent: "text-chart-2 bg-chart-2/10 border-chart-2/30",
    examples: ["Receipts", "Invoices", "Billing Reminders", "Payouts", "Refunds"],
  },
  {
    title: "Clinical Notifications",
    desc: "HIPAA-compliant patient updates, lab results, appointment reminders & care messages.",
    icon: Stethoscope,
    accent: "text-blue-300 bg-blue-500/10 border-blue-500/30",
    examples: ["Lab Results", "Appointments", "Rx Refills", "Care Updates"],
  },
  {
    title: "Business Notifications",
    desc: "Operational alerts, transactional updates, customer messaging & internal digests.",
    icon: Briefcase,
    accent: "text-primary bg-primary/10 border-primary/30",
    examples: ["Order Status", "Onboarding", "Account Activity", "Reports", "Alerts"],
  },
];

// ── Group metadata ────────────────────────────────────────────────────────────

const groupMeta = {
  hipaa: {
    title: "HIPAA Compliance Shield",
    desc: "Healthcare-grade redaction for PHI, PII and clinical codes.",
    icon: HeartPulse,
    accent: "blue" as const,
  },
  soc2: {
    title: "SOC2 Financial Guard",
    desc: "Block leakage of internal credentials and infrastructure routes.",
    icon: Lock,
    accent: "primary" as const,
  },
  cyber: {
    title: "Cyber Shield (Anti-Injection)",
    desc: "Detect adversarial prompts and context-override attacks.",
    icon: ShieldAlert,
    accent: "danger" as const,
  },
};

const accentCls = {
  blue: "from-blue-500/20 text-blue-300 border-blue-500/30",
  primary: "from-primary/20 text-primary border-primary/30",
  danger: "from-danger/20 text-danger border-danger/30",
};

const actionBadge = {
  DENY: "bg-danger/15 text-danger border-danger/30",
  REDACT: "bg-warning/15 text-warning border-warning/30",
  ALLOW: "bg-primary/15 text-primary border-primary/30",
};

// ── Page ──────────────────────────────────────────────────────────────────────

function PoliciesPage() {
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [policyMeta, setPolicyMeta] = useState({ name: "", version: "" });

  const fetchPolicies = useCallback(async () => {
    setError(null);
    try {
      const res = await getPolicies();
      setRules(res.rules);
      setPolicyMeta({ name: res.policy_name, version: res.version });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleToggle = async (rule: PolicyRule) => {
    // Optimistic update
    setRules((prev) =>
      prev.map((r) => r.name === rule.name ? { ...r, enabled: !r.enabled } : r)
    );
    setToggling(rule.name);
    try {
      await togglePolicy(rule.name, !rule.enabled);
    } catch {
      // Revert on failure
      setRules((prev) =>
        prev.map((r) => r.name === rule.name ? { ...r, enabled: rule.enabled } : r)
      );
    } finally {
      setToggling(null);
    }
  };

  // Group rules by their group key
  const grouped = (["hipaa", "soc2", "cyber"] as const).map((key) => ({
    key,
    meta: groupMeta[key],
    rules: rules.filter((r) => r.group === key),
  }));

  return (
    <>
      <Topbar
        title="Policy Manager"
        subtitle="Govern Lobster Trap rulesets across the org in real time"
      />
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto space-y-8">

        {/* Notification Categories */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Supported Notification Categories
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {notificationCategories.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.title}
                  className="group relative overflow-hidden rounded-xl border border-border bg-surface/40 backdrop-blur p-5 hover:border-primary/40 transition"
                >
                  <div className="absolute inset-0 bg-grid opacity-[0.03] pointer-events-none" />
                  <div className="relative">
                    <div className={cn("h-10 w-10 rounded-lg border flex items-center justify-center", c.accent)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-base font-semibold mt-4">{c.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{c.desc}</p>
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      {c.examples.map((ex) => (
                        <span key={ex} className="inline-flex items-center px-2 py-0.5 rounded-md border border-border bg-background/40 text-[10px] font-mono text-muted-foreground">
                          {ex}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Active Policy Rulesets */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Active Policy Rulesets
              </h2>
              {policyMeta.name && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-surface text-muted-foreground">
                  {policyMeta.name} · v{policyMeta.version}
                </span>
              )}
            </div>
            <button
              onClick={fetchPolicies}
              disabled={loading}
              className="h-8 w-8 rounded-md border border-border hover:bg-surface-elevated flex items-center justify-center text-muted-foreground hover:text-foreground transition"
              title="Refresh from Lobster Trap"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger mb-4">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Failed to load live policies</p>
                <p className="text-xs mt-0.5 text-danger/80">{error}</p>
                <p className="text-xs mt-1 text-danger/60">Showing cached state. Check that the Lobster Trap Space is running.</p>
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading ? (
            <div className="grid lg:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-border bg-surface/40 animate-pulse h-64" />
              ))}
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-5">
              {grouped.map(({ key, meta, rules: groupRules }) => {
                const Icon = meta.icon;
                const enabledCount = groupRules.filter((r) => r.enabled).length;
                return (
                  <div key={key} className={cn("rounded-xl border bg-gradient-to-b to-surface/40 backdrop-blur overflow-hidden", accentCls[meta.accent])}>
                    {/* Header */}
                    <div className="p-5 border-b border-border/60">
                      <div className="flex items-start justify-between">
                        <div className="h-10 w-10 rounded-lg bg-background/60 border border-border flex items-center justify-center">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] uppercase tracking-widest font-mono">
                          {enabledCount}/{groupRules.length} active
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-semibold mt-4 text-foreground">{meta.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{meta.desc}</p>
                    </div>

                    {/* Rules */}
                    <div className="divide-y divide-border/60">
                      {groupRules.length === 0 ? (
                        <div className="p-4 text-xs text-muted-foreground text-center">No rules loaded</div>
                      ) : groupRules.map((r) => (
                        <div key={r.name} className="p-4 flex items-start justify-between gap-3 hover:bg-surface-elevated/40 transition">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-foreground">{r.label}</p>
                              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider", actionBadge[r.action])}>
                                {r.action}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{r.description}</p>
                            <code className="text-[9px] text-muted-foreground/60 font-mono mt-1 block truncate">
                              {r.pattern}
                            </code>
                          </div>
                          <Toggle
                            on={r.enabled}
                            loading={toggling === r.name}
                            onChange={() => handleToggle(r)}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-border/60 bg-background/30">
                      <p className="text-[11px] text-muted-foreground">
                        Sourced from{" "}
                        <span className="text-foreground font-mono">sovereign-guard-enterprise</span>
                        {" "}· toggles persist in KV
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Toggle({
  on, onChange, loading,
}: {
  on: boolean;
  onChange: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={loading}
      className={cn(
        "shrink-0 relative inline-flex h-6 w-11 items-center rounded-full border transition",
        on ? "bg-primary/30 border-primary/60" : "bg-surface border-border",
        loading && "opacity-50 cursor-wait",
      )}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin mx-auto text-muted-foreground" />
      ) : (
        <span className={cn(
          "inline-block h-4 w-4 transform rounded-full transition shadow",
          on ? "translate-x-6 bg-primary" : "translate-x-1 bg-muted-foreground",
        )} />
      )}
    </button>
  );
}
