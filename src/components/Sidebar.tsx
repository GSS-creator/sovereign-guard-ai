import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, FlaskConical, ScrollText, KeyRound, X, FileBarChart, Users, Radar } from "lucide-react";
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

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { mobileOpen, setMobileOpen } = useLayout();

  // close on route change
  useEffect(() => { setMobileOpen(false); }, [pathname, setMobileOpen]);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          // Base: full height, fixed width, flex column
          "w-72 shrink-0 border-r border-border bg-surface/95 backdrop-blur-xl flex flex-col",
          // Desktop: always visible as part of the flex row
          "lg:relative lg:translate-x-0 lg:h-full",
          // Mobile: slide in/out as a fixed overlay
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 lg:static",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/guard.png"
              alt="SovereignGuard AI logo"
              className="h-12 w-auto object-contain"
            />
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden h-8 w-8 rounded-md border border-border hover:bg-surface-elevated flex items-center justify-center"
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
    </>
  );
}
