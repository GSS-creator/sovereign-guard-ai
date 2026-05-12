import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, FlaskConical, ScrollText, KeyRound, X, FileBarChart, Users, Radar, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/components/layout-context";
import { useEffect } from "react";
import { PoweredBy } from "@/components/PoweredBy";

const items = [
  { to: "/", label: "Security Console", icon: Activity },
  { to: "/sandbox", label: "Interactive Sandbox", icon: FlaskConical },
  { to: "/policies", label: "Policy Manager", icon: ScrollText },
  { to: "/intelligence", label: "Threat Intelligence", icon: Radar },
  { to: "/reports", label: "Audit & Reports", icon: FileBarChart },
  { to: "/team", label: "Team & Roles", icon: Users },
  { to: "/integrations", label: "API & Integrations", icon: KeyRound },
];

// First 4 items pinned in the bottom bar; rest accessible via the "More" drawer
const BOTTOM_NAV_ITEMS = items.slice(0, 4);

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { mobileOpen, setMobileOpen } = useLayout();

  // close on route change
  useEffect(() => { setMobileOpen(false); }, [pathname, setMobileOpen]);

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden lg:flex w-72 shrink-0 border-r border-border bg-surface/95 backdrop-blur-xl flex-col h-full">
        <div className="p-6 border-b border-border flex items-center">
          <img
            src="/guard.png"
            alt="SovereignGuard AI logo"
            className="h-12 w-auto object-contain"
          />
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all relative overflow-hidden",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-primary" />
                )}
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <PoweredBy compact />
        </div>
      </aside>

      {/* ── Mobile: full-screen drawer (opened via "More" button) ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-surface/98 backdrop-blur-xl border-r border-border flex flex-col transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="p-5 border-b border-border flex items-center justify-between">
          <img src="/guard.png" alt="SovereignGuard AI" className="h-10 w-auto object-contain" />
          <button
            onClick={() => setMobileOpen(false)}
            className="h-8 w-8 rounded-md border border-border hover:bg-surface-elevated flex items-center justify-center"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all relative overflow-hidden",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-primary" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <PoweredBy compact />
        </div>
      </aside>

      {/* ── Mobile: bottom navigation bar ───────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur-xl border-t border-border flex items-stretch pb-safe">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors min-h-[56px]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_var(--primary)]")} />
              <span className="truncate max-w-[56px] text-center leading-tight">
                {item.label.split(" ")[0]}
              </span>
            </Link>
          );
        })}
        {/* "More" button opens the full drawer */}
        <button
          onClick={() => setMobileOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors min-h-[56px]",
            mobileOpen ? "text-primary" : "text-muted-foreground",
          )}
          aria-label="More navigation"
        >
          <Menu className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
