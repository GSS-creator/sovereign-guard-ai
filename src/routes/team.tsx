import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Topbar } from "@/components/Topbar";
import {
  Users, UserPlus, Shield, Eye, Code2, ShieldCheck, MoreHorizontal,
  Check, X, Activity, Clock, Loader2, Trash2, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTeamMembers, getPermissions, getTeamActivity,
  inviteMember, updateMember, removeMember,
} from "@/lib/api-client";
import type { TeamMember, Permission, ActivityEntry, Role, TeamStats } from "@/lib/api-client";

export const Route = createFileRoute("/team")({
  component: TeamPage,
  head: () => ({ meta: [
    { title: "Team & Roles — SovereignGuard AI" },
    { name: "description", content: "Invite teammates, assign roles, and audit every privileged action." },
  ] }),
});

const roleMeta: Record<Role, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  admin:     { label: "Admin",            icon: ShieldCheck, cls: "bg-primary/15 text-primary border-primary/30"   },
  analyst:   { label: "Security Analyst", icon: Shield,      cls: "bg-warning/15 text-warning border-warning/30"   },
  developer: { label: "Developer",        icon: Code2,       cls: "bg-chart-2/15 text-chart-2 border-chart-2/30"   },
  viewer:    { label: "Viewer",           icon: Eye,         cls: "bg-muted text-muted-foreground border-border"    },
};

const toneCls = {
  primary: "bg-primary/10 text-primary border-primary/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  chart:   "bg-chart-2/10 text-chart-2 border-chart-2/20",
};

function formatTimestamp(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  if (diff < 172_800_000) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState<Role>("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !email.trim()) { setError("Name and email are required"); return; }
    setLoading(true); setError(null);
    try {
      await inviteMember({ name: name.trim(), email: email.trim(), role });
      onInvited();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl p-6 space-y-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Invite Member</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-md border border-border hover:bg-surface-elevated flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">{error}</p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Full Name</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className="mt-1.5 w-full h-10 px-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Email</label>
            <input
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              type="email"
              className="mt-1.5 w-full h-10 px-3 rounded-md bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Role</label>
            <select
              value={role} onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1.5 w-full h-10 px-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {(Object.keys(roleMeta) as Role[]).map((r) => (
                <option key={r} value={r}>{roleMeta[r].label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-md border border-border text-sm font-medium hover:bg-surface-elevated transition">
            Cancel
          </button>
          <button
            onClick={submit} disabled={loading}
            className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function TeamPage() {
  const [tab, setTab] = useState<"members" | "permissions" | "activity">("members");

  const [members, setMembers]       = useState<TeamMember[]>([]);
  const [stats, setStats]           = useState<TeamStats>({ total: 0, active: 0, pending: 0, roles: 0 });
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [activity, setActivity]     = useState<ActivityEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [membersRes, permsRes, actRes] = await Promise.all([
        getTeamMembers(),
        getPermissions(),
        getTeamActivity(),
      ]);
      setMembers(membersRes.members);
      setStats(membersRes.stats);
      setPermissions(permsRes.permissions);
      setActivity(actRes.activity);
    } catch {
      // keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleRoleChange = async (member: TeamMember, newRole: Role) => {
    setActionLoading(member.email);
    try {
      const res = await updateMember(member.email, { role: newRole });
      setMembers((prev) => prev.map((m) => m.email === member.email ? res.member : m));
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleRemove = async (member: TeamMember) => {
    if (!confirm(`Remove ${member.name} from the team?`)) return;
    setActionLoading(member.email);
    try {
      await removeMember(member.email);
      setMembers((prev) => prev.filter((m) => m.email !== member.email));
      setStats((s) => ({ ...s, total: s.total - 1, active: member.status === "active" ? s.active - 1 : s.active, pending: member.status === "pending" ? s.pending - 1 : s.pending }));
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  return (
    <>
      <Topbar title="Team & Roles" subtitle="Granular access control with full audit trail" />
      <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8 overflow-auto">

        {/* Header strip */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat label="Members"          value={loading ? "…" : String(stats.total)}   icon={Users}    />
            <MiniStat label="Active Roles"     value={loading ? "…" : String(stats.roles)}   icon={Shield}   />
            <MiniStat label="Pending Invites"  value={loading ? "…" : String(stats.pending)} icon={Clock}    />
            <MiniStat label="Audit Events"     value={loading ? "…" : String(activity.length)} icon={Activity} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchAll}
              className="h-10 w-10 rounded-lg border border-border hover:bg-surface-elevated flex items-center justify-center text-muted-foreground hover:text-foreground transition"
              title="Refresh"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
            <button
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 glow-emerald transition"
            >
              <UserPlus className="h-4 w-4" />
              Invite Member
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {[
            { id: "members",     label: "Members" },
            { id: "permissions", label: "Permissions Matrix" },
            { id: "activity",    label: "Audit Log" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition relative",
                tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {tab === t.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />}
            </button>
          ))}
        </div>

        {/* Members tab */}
        {tab === "members" && (
          <div className="rounded-xl border border-border bg-surface/40 backdrop-blur overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading members…</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="text-left font-medium px-3 sm:px-6 py-3">Member</th>
                      <th className="text-left font-medium px-3 sm:px-6 py-3">Role</th>
                      <th className="text-left font-medium px-3 sm:px-6 py-3">Status</th>
                      <th className="text-left font-medium px-3 sm:px-6 py-3">Last Active</th>
                      <th className="text-right font-medium px-3 sm:px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const r = roleMeta[m.role];
                      const RIcon = r.icon;
                      const isActing = actionLoading === m.email;
                      return (
                        <tr key={m.email} className="border-b border-border/60 last:border-0 hover:bg-surface-elevated/40 transition">
                          <td className="px-3 sm:px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/30 to-chart-2/20 border border-border flex items-center justify-center font-display text-xs font-semibold shrink-0">
                                {m.initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{m.name}</p>
                                <p className="text-[11px] text-muted-foreground font-mono truncate">{m.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-3">
                            <select
                              value={m.role}
                              disabled={isActing}
                              onChange={(e) => handleRoleChange(m, e.target.value as Role)}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold bg-transparent cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40",
                                r.cls,
                              )}
                            >
                              {(Object.keys(roleMeta) as Role[]).map((role) => (
                                <option key={role} value={role}>{roleMeta[role].label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 sm:px-6 py-3">
                            {m.status === "active" ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-primary">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-warning">
                                <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Pending
                              </span>
                            )}
                          </td>
                          <td className="px-3 sm:px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {m.last_seen_label}
                          </td>
                          <td className="px-3 sm:px-6 py-3 text-right">
                            {isActing ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
                            ) : (
                              <button
                                onClick={() => handleRemove(m)}
                                className="h-8 w-8 rounded-md border border-border hover:bg-danger/10 hover:border-danger/40 hover:text-danger inline-flex items-center justify-center text-muted-foreground transition"
                                title="Remove member"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Permissions tab */}
        {tab === "permissions" && (
          <div className="rounded-xl border border-border bg-surface/40 backdrop-blur overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="text-left font-medium px-3 sm:px-6 py-3">Permission</th>
                      {(["admin", "analyst", "developer", "viewer"] as Role[]).map((r) => (
                        <th key={r} className="text-center font-medium px-3 py-3">{roleMeta[r].label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((p) => (
                      <tr key={p.label} className="border-b border-border/60 last:border-0">
                        <td className="px-3 sm:px-6 py-3 font-medium">{p.label}</td>
                        {(["admin", "analyst", "developer", "viewer"] as Role[]).map((r) => (
                          <td key={r} className="px-3 py-3 text-center">
                            {p[r] ? (
                              <Check className="h-4 w-4 text-primary mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Activity tab */}
        {tab === "activity" && (
          <div className="rounded-xl border border-border bg-surface/40 backdrop-blur divide-y divide-border">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Activity className="h-8 w-8 opacity-30" />
                <p className="text-sm">No activity yet.</p>
              </div>
            ) : activity.map((a) => (
              <div key={a.id} className="flex items-center gap-4 px-4 sm:px-6 py-4 hover:bg-surface-elevated/30 transition">
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider shrink-0", toneCls[a.tone])}>
                  {a.what}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{a.who}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="font-mono text-xs text-muted-foreground">{a.target}</span>
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {formatTimestamp(a.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvited={fetchAll}
        />
      )}
    </>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 backdrop-blur px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="font-display text-xl font-semibold mt-1 tracking-tight">{value}</p>
    </div>
  );
}
