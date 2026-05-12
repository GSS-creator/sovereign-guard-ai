/**
 * SetupBanner — shown when the org hasn't configured their API keys yet.
 * Links directly to the signup/key pages for each service.
 */

import { AlertTriangle, ExternalLink, X, ArrowRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

interface SetupBannerProps {
  geminiConfigured: boolean;
  qemailConfigured: boolean;
  /** If true, shows a compact inline version instead of the full banner */
  compact?: boolean;
}

const SERVICES = [
  {
    key: "gemini" as const,
    name: "Gemini API",
    description: "Powers AI content generation for your notifications",
    steps: [
      { label: "Go to Google AI Studio", url: "https://aistudio.google.com/apikey" },
      { label: 'Click "Create API key"', url: null },
      { label: "Copy the key (starts with AIzaSy…)", url: null },
    ],
    color: "text-chart-2 bg-chart-2/10 border-chart-2/30",
    icon: "✨",
  },
  {
    key: "qemail" as const,
    name: "QEmail Smart Connect",
    description: "Delivers your emails via SMTP relay",
    steps: [
      { label: "Go to QEmail Smart Connect", url: "https://smartconnect.gss-tec.com/" },
      { label: "Sign up or log in", url: null },
      { label: "Copy your API key (starts with qssn_live_…)", url: null },
    ],
    color: "text-primary bg-primary/10 border-primary/30",
    icon: "✉️",
  },
];

export function SetupBanner({ geminiConfigured, qemailConfigured, compact = false }: SetupBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  const missing = SERVICES.filter((s) =>
    s.key === "gemini" ? !geminiConfigured : !qemailConfigured
  );

  if (missing.length === 0 || dismissed) return null;

  if (compact) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        <p className="text-xs text-warning flex-1">
          {missing.length === 2
            ? "Gemini and QEmail keys not configured — notifications won't send."
            : `${missing[0].name} key not configured.`}
        </p>
        <button
          onClick={() => navigate({ to: "/integrations" })}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-warning hover:underline"
        >
          Set up now <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-warning/20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-warning/15 text-warning flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">
              {missing.length === 2
                ? "2 API keys required to send notifications"
                : `${missing[0].name} key required`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Follow the steps below, then come back and paste your keys in the form above.
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="h-7 w-7 rounded-md hover:bg-surface-elevated flex items-center justify-center text-muted-foreground hover:text-foreground transition shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Service cards */}
      <div className={cn("grid gap-4 p-5", missing.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1 max-w-lg")}>
        {missing.map((svc) => (
          <div key={svc.key} className={cn("rounded-lg border p-4 space-y-3", svc.color)}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{svc.icon}</span>
              <div>
                <p className="font-semibold text-sm">{svc.name}</p>
                <p className="text-[11px] text-muted-foreground">{svc.description}</p>
              </div>
            </div>
            <ol className="space-y-2">
              {svc.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 h-4 w-4 rounded-full bg-background/60 border border-current flex items-center justify-center text-[9px] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  {step.url ? (
                    <a
                      href={step.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium hover:underline"
                    >
                      {step.label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{step.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="px-5 pb-4">
        <p className="text-[11px] text-muted-foreground">
          🔒 Keys are encrypted with AES-256 and stored securely in your organisation's database. They are never logged or shared.
        </p>
      </div>
    </div>
  );
}
