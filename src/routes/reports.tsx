import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Topbar } from "@/components/Topbar";
import {
  FileBarChart, Download, FileText, FileSpreadsheet, Calendar,
  ShieldCheck, CheckCircle2, Clock, ArrowRight, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuditLogs } from "@/lib/api-client";
import type { AuditLogEntry } from "@/types/api";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
  head: () => ({ meta: [
    { title: "Audit & Compliance Reports — SovereignGuard AI" },
    { name: "description", content: "Generate SOC 2, HIPAA, and GDPR-ready compliance reports with one click." },
  ] }),
});

const frameworks = [
  { id: "soc2", name: "SOC 2 Type II", desc: "Trust services criteria — security, availability, confidentiality.", color: "primary", coverage: 98 },
  { id: "hipaa", name: "HIPAA", desc: "PHI handling, access controls, breach notification readiness.", color: "chart" as const, coverage: 100 },
  { id: "gdpr", name: "GDPR", desc: "Data subject rights, lawful processing, cross-border transfers.", color: "warning" as const, coverage: 96 },
  { id: "iso", name: "ISO 27001", desc: "Annex A control mapping for information security management.", color: "primary" as const, coverage: 92 },
];

const recent = [
  { id: "RPT-2026-0418", framework: "SOC 2 Type II", range: "Apr 1 – Apr 30, 2026", format: "PDF", status: "ready", size: "2.4 MB" },
  { id: "RPT-2026-0417", framework: "HIPAA", range: "Q1 2026", format: "PDF", status: "ready", size: "1.8 MB" },
  { id: "RPT-2026-0416", framework: "GDPR", range: "Mar 2026", format: "CSV", status: "ready", size: "412 KB" },
  { id: "RPT-2026-0415", framework: "SOC 2 Type II", range: "Mar 2026", format: "PDF", status: "ready", size: "2.1 MB" },
];

const colorMap = {
  primary: "text-primary bg-primary/10 border-primary/30",
  chart: "text-chart-2 bg-chart-2/10 border-chart-2/30",
  warning: "text-warning bg-warning/10 border-warning/30",
} as const;

function ReportsPage() {
  const [framework, setFramework] = useState("soc2");
  const [range, setRange] = useState("30d");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    getAuditLogs(100)
      .then((r) => setAuditLogs(r.logs))
      .catch(() => {})
      .finally(() => setLogsLoading(false));
  }, []);

  // Derive stats from real logs
  const totalReports = auditLogs.length;
  const passRate = totalReports > 0
    ? ((auditLogs.filter((l) => l.delivery_status === "delivered").length / totalReports) * 100).toFixed(1) + "%"
    : "—";

  const generate = () => {
    setGenerating(true);
    setGenerated(false);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 1600);
  };

  // Format audit logs as "recent reports" rows
  const recentRows = auditLogs.slice(0, 8).map((l) => ({
    id: l.transaction_id,
    framework: l.policy_type.toUpperCase(),
    range: new Date(l.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    format: "JSON",
    status: l.delivery_status,
    size: "—",
  }));

  return (
    <>
      <Topbar title="Audit & Compliance Reports" subtitle="Auditor-ready exports across every dispatch and policy event" />
      <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8 overflow-auto">
        {/* Hero stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Transactions Logged" value={logsLoading ? "…" : totalReports.toString()} icon={FileBarChart} />
          <Stat label="Active Frameworks" value="4" icon={ShieldCheck} />
          <Stat label="Delivery Pass Rate" value={logsLoading ? "…" : passRate} icon={CheckCircle2} accent />
          <Stat label="Avg. Generation" value="1.4s" icon={Clock} />
        </div>

        {/* Generator */}
        <div className="rounded-xl border border-border bg-surface/40 backdrop-blur overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-display text-base font-semibold">Generate Compliance Report</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Auditor-ready PDF or CSV in seconds.</p>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Framework</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {frameworks.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFramework(f.id)}
                    className={cn(
                      "text-left p-4 rounded-lg border transition group",
                      framework === f.id
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-surface-elevated/30 hover:border-primary/30",
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display text-sm font-semibold">{f.name}</span>
                      <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", colorMap[f.color as keyof typeof colorMap] ?? colorMap.primary)}>
                        {f.coverage}%
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Date Range</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "7d", label: "Last 7 days" },
                    { id: "30d", label: "Last 30 days" },
                    { id: "qtd", label: "Quarter to date" },
                    { id: "ytd", label: "Year to date" },
                  ].map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRange(r.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium border transition",
                        range === r.id
                          ? "bg-primary/15 text-primary border-primary/40"
                          : "bg-surface-elevated/40 text-muted-foreground border-border hover:text-foreground",
                      )}
                    >
                      <Calendar className="h-3 w-3 inline mr-1.5 -mt-0.5" />
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Format</p>
                <div className="flex gap-2">
                  <FormatChip icon={FileText} label="PDF" active />
                  <FormatChip icon={FileSpreadsheet} label="CSV" />
                  <FormatChip icon={FileSpreadsheet} label="XLSX" />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Includes dispatch logs, policy evaluations, blocked events, anonymization metrics, and signed evidence chain.
              </p>
              <button
                onClick={generate}
                disabled={generating}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition shrink-0",
                  generated
                    ? "bg-primary/15 text-primary border border-primary/40"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 glow-emerald",
                )}
              >
                {generating ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                    Generating…
                  </>
                ) : generated ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Report ready · Download
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Generate Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Recent reports */}
        <div className="rounded-xl border border-border bg-surface/40 backdrop-blur overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold">Recent Reports</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Signed, immutable, and timestamped.</p>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline">retention · 7 yrs</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left font-medium px-3 sm:px-6 py-3">Transaction ID</th>
                  <th className="text-left font-medium px-3 sm:px-6 py-3">Policy</th>
                  <th className="text-left font-medium px-3 sm:px-6 py-3">Date</th>
                  <th className="text-left font-medium px-3 sm:px-6 py-3">Status</th>
                  <th className="text-right font-medium px-3 sm:px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      <span className="text-sm">Loading audit log…</span>
                    </td>
                  </tr>
                ) : recentRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No transactions yet. Use the Sandbox to send your first notification.
                    </td>
                  </tr>
                ) : recentRows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-surface-elevated/40 transition">
                    <td className="px-3 sm:px-6 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{r.id}</td>
                    <td className="px-3 sm:px-6 py-3 font-medium">{r.framework}</td>
                    <td className="px-3 sm:px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.range}</td>
                    <td className="px-3 sm:px-6 py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-mono",
                        r.status === "delivered" ? "border-primary/30 bg-primary/10 text-primary" :
                        r.status === "blocked" ? "border-danger/30 bg-danger/10 text-danger" :
                        "border-border bg-surface-elevated/60 text-muted-foreground"
                      )}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-right">
                      <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        View <ArrowRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent?: boolean }) {
  return (
    <div className={cn(
      "rounded-xl border p-4 backdrop-blur transition",
      accent ? "border-primary/30 bg-primary/5" : "border-border bg-surface/60",
    )}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <Icon className={cn("h-4 w-4", accent ? "text-primary" : "text-muted-foreground")} />
      </div>
      <p className={cn("font-display text-2xl font-semibold mt-2 tracking-tight", accent && "text-primary")}>{value}</p>
    </div>
  );
}

function FormatChip({ icon: Icon, label, active }: { icon: React.ComponentType<{ className?: string }>; label: string; active?: boolean }) {
  return (
    <button className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition",
      active
        ? "bg-primary/15 text-primary border-primary/40"
        : "bg-surface-elevated/40 text-muted-foreground border-border hover:text-foreground",
    )}>
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
