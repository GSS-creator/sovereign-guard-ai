/**
 * PoweredBy — Technology attribution strip
 * Used on the auth page and inside the app sidebar footer.
 */

import { cn } from "@/lib/utils";

interface PoweredByProps {
  className?: string;
  compact?: boolean; // sidebar uses compact mode
}

interface Partner {
  name: string;
  url: string;
  github?: string;
  /** Emoji fallback — used when no logo is provided */
  icon: string;
  /** Path to a real logo image (relative to /public) */
  logo?: string;
}

const PARTNERS: Partner[] = [
  {
    name: "Cloudflare",
    url: "https://cloudflare.com",
    icon: "☁️",
  },
  {
    name: "QEmail Smart Connect",
    url: "https://smartconnect.gss-tec.com/",
    icon: "✉️",
    logo: "/smart.png",
  },
  {
    name: "GSS-TEC",
    url: "https://www.gss-tec.com",
    icon: "🏢",
    logo: "/GSS-TEC.png",
  },
  {
    name: "Gemini",
    url: "https://deepmind.google/technologies/gemini/",
    icon: "✨",
  },
  {
    name: "Lobster Trap by Veea",
    url: "https://www.veea.com/",
    github: "https://github.com/veeainc/lobstertrap",
    icon: "🛡️",
  },
  {
    name: "Google Gmail",
    url: "https://gmail.com",
    icon: "📧",
  },
  {
    name: "Lablab.ai",
    url: "https://lablab.ai",
    icon: "🤖",
  },
];

export function PoweredBy({ className, compact = false }: PoweredByProps) {
  if (compact) {
    // Sidebar footer — compact chips
    return (
      <div className={cn("space-y-2", className)}>
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium px-1">
          Powered by
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PARTNERS.map((p) => (
            <a
              key={p.name}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              title={p.name}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-background/40 text-[9px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
            >
              {p.logo ? (
                <img src={p.logo} alt={p.name} className="h-3.5 w-auto object-contain" />
              ) : (
                <span>{p.icon}</span>
              )}
              <span className="font-mono truncate max-w-[60px]">{p.name.split(" ")[0]}</span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  // Auth page — full strip
  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-center text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        Powered by
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {PARTNERS.map((p) => (
          <div key={p.name} className="inline-flex items-center gap-1">
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface/60 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-surface transition"
            >
              {p.logo ? (
                <img src={p.logo} alt={p.name} className="h-4 w-auto object-contain" />
              ) : (
                <span className="text-sm">{p.icon}</span>
              )}
              <span>{p.name}</span>
            </a>
            {p.github && (
              <a
                href={p.github}
                target="_blank"
                rel="noopener noreferrer"
                title={`${p.name} on GitHub`}
                className="inline-flex items-center px-1.5 py-1 rounded-md border border-border bg-surface/60 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-surface transition"
              >
                {/* GitHub icon via SVG */}
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
