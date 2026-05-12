import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/Topbar";
import {
  Send, ShieldAlert, Eye, Activity, ArrowUpRight, ArrowDownRight, X,
  CheckCircle2, AlertTriangle, ShieldX, ChevronDown, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuditLogs, getHealth, type HealthResponse } from "@/lib/api-client";
import type { AuditLogEntry } from "@/types/api";

export const Route = createFileRoute("/")({
  component: ConsolePage,
  head: () => ({ meta: [{ title: "Security Console — SovereignGuard AI" }] }),
});

type Verdict = "secure" | "sanitized" | "blocked";

type Event = {
  id: string;
  time: string;
  destination: string;
  type: "Payment Receipt" | "Clinical Update" | "Security Alert" | "Operations Digest";
  verdict: Verdict;
  raw: string;
  sanitized: string;
  html: string;
};

// Map audit log entries to display events
function auditToEvent(log: AuditLogEntry): Event {
  const policyTypeMap: Record<string, Event["type"]> = {
    soc2: "Payment Receipt",
    hipaa: "Clinical Update",
    security: "Security Alert",
  };

  let verdict: Verdict = "secure";
  if (log.delivery_status === "blocked") verdict = "blocked";
  else if (log.threat_score > 0) verdict = "sanitized";

  const elapsed = Math.floor((Date.now() - new Date(log.timestamp).getTime()) / 1000);
  const time =
    elapsed < 10 ? "Just now" :
    elapsed < 60 ? `${elapsed}s ago` :
    elapsed < 3600 ? `${Math.floor(elapsed / 60)} min ago` :
    `${Math.floor(elapsed / 3600)} hr ago`;

  return {
    id: log.transaction_id,
    time,
    destination: log.recipient_email.replace(/(?<=.{2}).(?=.*@)/g, "*"),
    type: policyTypeMap[log.policy_type] ?? "Operations Digest",
    verdict,
    raw: `Policy: ${log.policy_type.toUpperCase()} | Threat score: ${log.threat_score}`,
    sanitized: log.error ?? `Delivered via QSSN · ID: ${log.transaction_id}`,
    html: `<div style="font-family:Inter,sans-serif;background:#0f172a;padding:24px;border-radius:12px;color:#e2e8f0">
      <h2 style="color:#10b981;margin:0 0 12px">SovereignGuard AI</h2>
      <p>Transaction <b>${log.transaction_id}</b></p>
      <p>Policy: <b>${log.policy_type.toUpperCase()}</b> · Status: <b>${log.delivery_status}</b></p>
      <p style="color:#94a3b8;font-size:12px;margin-top:12px">${log.timestamp}</p>
    </div>`,
  };
}

function StatCard({
  label, value, delta, deltaPositive, icon: Icon, accent,
}: {
  label: string; value: string; delta: string; deltaPositive?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "danger" | "warning" | "chart";
}) {
  const accentMap = {
    primary: "text-primary bg-primary/10",
    danger: "text-danger bg-danger/10",
    warning: "text-warning bg-warning/10",
    chart: "text-chart-2 bg-chart-2/10",
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface/60 p-5 backdrop-blur transition hover:border-primary/40 group">
      <div className="absolute inset-0 bg-grid opacity-[0.04] pointer-events-none" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</p>
          <div className={cn("mt-2 flex items-center gap-1 text-xs font-medium", deltaPositive ? "text-primary" : "text-danger")}>
            {deltaPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            <span>{delta}</span>
            <span className="text-muted-foreground font-normal ml-1">vs 24h</span>
          </div>
        </div>
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", accentMap[accent])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <Sparkline accent={accent} />
    </div>
  );
}

function Sparkline({ accent }: { accent: "primary" | "danger" | "warning" | "chart" }) {
  const colorVar = {
    primary: "var(--primary)",
    danger: "var(--danger)",
    warning: "var(--warning)",
    chart: "var(--chart-2)",
  }[accent];
  const pts = [10, 14, 9, 18, 12, 22, 16, 26, 19, 30, 24, 34];
  const max = Math.max(...pts);
  const path = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${40 - (p / max) * 32}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" className="mt-3 h-10 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g-${accent}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colorVar} stopOpacity="0.4" />
          <stop offset="100%" stopColor={colorVar} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={colorVar} strokeWidth="1.5" points={path} />
      <polygon fill={`url(#g-${accent})`} points={`0,40 ${path} 100,40`} />
    </svg>
  );
}

const verdictStyles: Record<Verdict, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  secure: { label: "SECURE & SENT", cls: "bg-primary/15 text-primary border-primary/30", icon: CheckCircle2 },
  sanitized: { label: "SANITIZED & SENT", cls: "bg-warning/15 text-warning border-warning/30", icon: AlertTriangle },
  blocked: { label: "BLOCKED / TERMINATED", cls: "bg-danger/15 text-danger border-danger/30", icon: ShieldX },
};

const typeStyles: Record<Event["type"], string> = {
  "Payment Receipt": "bg-chart-2/10 text-chart-2 border-chart-2/20",
  "Clinical Update": "bg-blue-500/10 text-blue-300 border-blue-500/20",
  "Security Alert": "bg-danger/10 text-danger border-danger/20",
  "Operations Digest": "bg-muted text-muted-foreground border-border",
};

function ConsolePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stats, setStats] = useState({ total: 0, blocked: 0, sanitized: 0, rate: "—" });
  const [selected, setSelected] = useState<Event | null>(null);
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_COUNT = 3;
  const visibleEvents = expanded ? events : events.slice(0, COLLAPSED_COUNT);

  const fetchData = useCallback(async () => {
    try {
      const [logsRes, healthRes] = await Promise.all([
        getAuditLogs(50),
        getHealth(),
      ]);
      setHealth(healthRes);
      const mapped = logsRes.logs.map(auditToEvent);
      setEvents(mapped);

      const total = logsRes.logs.length;
      const blocked = logsRes.logs.filter((l) => l.delivery_status === "blocked").length;
      const sanitized = logsRes.logs.filter((l) => l.threat_score > 0 && l.dpi_passed).length;
      const delivered = logsRes.logs.filter((l) => l.delivery_status === "delivered").length;
      const rate = total > 0 ? ((delivered + sanitized) / total * 100).toFixed(1) + "%" : "—";
      setStats({ total, blocked, sanitized, rate });
    } catch {
      // backend not yet available — show empty state gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Poll every 15s for live feed feel
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <>
      <Topbar title="Security Console" subtitle="Live observability across QEmail Smart Connect dispatches" />
      <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8 overflow-auto">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total Dispatches" value={loading ? "…" : stats.total.toLocaleString()} delta="+live" deltaPositive icon={Send} accent="chart" />
          <StatCard label="Data Leaks Blocked" value={loading ? "…" : stats.blocked.toString()} delta="DPI enforced" deltaPositive icon={ShieldAlert} accent="danger" />
          <StatCard label="Anonymization Rate" value={loading ? "…" : stats.rate} delta="REDACT rules" deltaPositive icon={Eye} accent="warning" />
          <StatusCard health={health} loading={loading} />
        </div>

        {/* Feed */}
        <div className="rounded-xl border border-border bg-surface/40 backdrop-blur overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-6 py-4 border-b border-border text-left hover:bg-surface-elevated/40 transition group"
            aria-expanded={expanded}
          >
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold">Live Threat & Compliance Feed</h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {loading
                  ? "Loading audit log…"
                  : events.length === 0
                  ? "No transactions yet — send your first notification"
                  : expanded
                  ? `Showing all ${events.length} events`
                  : `Showing ${Math.min(COLLAPSED_COUNT, events.length)} of ${events.length} — tap to expand`}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs shrink-0">
              <div className="hidden sm:flex items-center gap-2">
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    <span className="text-muted-foreground">Live</span>
                  </>
                )}
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform group-hover:text-foreground", expanded && "rotate-180")} />
            </div>
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading audit log…</span>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Activity className="h-8 w-8 opacity-30" />
              <p className="text-sm">No transactions yet.</p>
              <p className="text-xs">Use the Interactive Sandbox to send your first notification.</p>
            </div>
          ) : (
            <div className={cn("overflow-x-auto transition-all", !expanded && "max-h-[320px]")}>
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left font-medium px-3 sm:px-6 py-3">Time</th>
                    <th className="text-left font-medium px-3 sm:px-6 py-3">Destination</th>
                    <th className="text-left font-medium px-3 sm:px-6 py-3">Type</th>
                    <th className="text-left font-medium px-3 sm:px-6 py-3">Verdict</th>
                    <th className="text-right font-medium px-3 sm:px-6 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((e) => {
                    const v = verdictStyles[e.verdict];
                    const VIcon = v.icon;
                    return (
                      <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-surface-elevated/40 transition animate-fade-up">
                        <td className="px-3 sm:px-6 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{e.time}</td>
                        <td className="px-3 sm:px-6 py-3 font-mono text-xs">{e.destination}</td>
                        <td className="px-3 sm:px-6 py-3">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium", typeStyles[e.type])}>
                            {e.type}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-3">
                          <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold tracking-wide", v.cls)}>
                            <VIcon className="h-3 w-3" />
                            {v.label}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-right">
                          <button onClick={() => setSelected(e)} className="text-xs font-medium text-primary hover:underline">
                            View Details →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {events.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-6 py-3 border-t border-border text-xs font-medium text-primary hover:bg-primary/5 transition flex items-center justify-center gap-1.5"
            >
              {expanded ? "Collapse feed" : `Show all ${events.length} events`}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
            </button>
          )}
        </div>
      </div>

      {selected && <DetailsDrawer event={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function StatusCard({ health, loading }: { health: HealthResponse | null; loading: boolean }) {
  const allGood = health
    ? Object.values(health.bindings).every(Boolean)
    : false;

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface/60 to-surface p-5 glow-emerald">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">System Status</p>
          <div className="mt-3 flex items-center gap-3">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <span className="pulse-dot h-3 w-3 rounded-full bg-primary" />
            )}
            <p className={cn("font-display text-2xl font-semibold", allGood || loading ? "text-primary" : "text-warning")}>
              {loading ? "Checking…" : allGood ? "Secure" : "Degraded"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {health ? "All trust layers nominal" : "Connecting to gateway…"}
          </p>
        </div>
        <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
          <Activity className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-6 gap-1">
        {[
          { label: "Dashboard", ok: true },
          { label: "Cloudflare", ok: !!health },
          { label: "Lobster", ok: health?.bindings.lobster_trap ?? false },
          { label: "Gemini", ok: health?.bindings.gemini_key ?? false },
          { label: "QEmail", ok: health?.bindings.qemail_token ?? false },
          { label: "KV", ok: health?.bindings.kv ?? false },
        ].map((l) => (
          <div key={l.label} className="space-y-1">
            <div className={cn("h-1 rounded-full", l.ok ? "bg-primary/60" : "bg-muted")} />
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground truncate">{l.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailsDrawer({ event, onClose }: { event: Event; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-surface border-l border-border shadow-2xl overflow-y-auto animate-fade-up">
        <div className="sticky top-0 bg-surface/95 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-mono">{event.id}</p>
            <h3 className="font-display text-lg font-semibold">{event.type}</h3>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md border border-border hover:bg-surface-elevated flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <Section title="Raw Input" tone="danger">
            <pre className="font-mono text-xs whitespace-pre-wrap text-foreground/90">{event.raw}</pre>
          </Section>
          <Section title="Sanitized Output" tone="warning">
            <pre className="font-mono text-xs whitespace-pre-wrap text-foreground/90">{event.sanitized}</pre>
          </Section>
          <Section title="Gemini Generated HTML Email" tone="primary">
            <div className="rounded-md overflow-hidden bg-white">
              <iframe srcDoc={event.html} className="w-full h-[280px]" title="email" />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone: "primary" | "danger" | "warning"; children: React.ReactNode }) {
  const toneCls = {
    primary: "border-primary/30 bg-primary/5",
    danger: "border-danger/30 bg-danger/5",
    warning: "border-warning/30 bg-warning/5",
  }[tone];
  return (
    <div className={cn("rounded-lg border p-4", toneCls)}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">{title}</p>
      {children}
    </div>
  );
}
