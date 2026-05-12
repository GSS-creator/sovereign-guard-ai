import { Bell, Search, LogOut } from "lucide-react";
import { getStoredOrg, clearAuthToken, logout } from "@/lib/api-client";
import { useNavigate } from "@tanstack/react-router";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigate = useNavigate();
  const org = getStoredOrg();

  const handleLogout = async () => {
    await logout().catch(() => {});
    clearAuthToken();
    navigate({ to: "/auth" });
  };
  return (
    <header className="h-16 shrink-0 border-b border-border px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 bg-background/60 backdrop-blur-xl sticky top-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <h2 className="font-display text-base sm:text-xl font-semibold tracking-tight truncate">{title}</h2>
          {subtitle && <p className="hidden sm:block text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="hidden xl:flex items-center gap-2 px-3 h-9 rounded-md bg-surface border border-border w-72 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <span>Search events, recipients, hashes…</span>
          <kbd className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded bg-background border border-border">⌘K</kbd>
        </div>
        <button className="relative h-9 w-9 rounded-md bg-surface border border-border flex items-center justify-center hover:bg-surface-elevated transition">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-danger" />
        </button>
        <div className="flex items-center gap-2 sm:pl-3 sm:border-l border-border">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center text-xs font-semibold text-primary-foreground">
            {org ? org.name.slice(0, 2).toUpperCase() : "CI"}
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-medium leading-none">{org?.name ?? "CISO Console"}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{org ? `${org.plan} plan` : "sovereign.io"}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="h-9 px-3 rounded-md border border-border hover:bg-surface-elevated text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition"
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
