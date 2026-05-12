import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Shield, Eye, EyeOff, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  register, login, setAuthToken, setStoredOrg, getAuthToken,
} from "@/lib/api-client";
import { PoweredBy } from "@/components/PoweredBy";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign In — SovereignGuard AI" }] }),
});

function AuthPage() {
  const navigate = useNavigate();

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (getAuthToken()) navigate({ to: "/" });
  }, [navigate]);

  // Determine initial mode: if no org has ever registered on this browser → register
  // If they've logged out → login
  const [mode, setMode] = useState<"register" | "login">(() => {
    if (typeof window === "undefined") return "register";
    return localStorage.getItem("sg_has_registered") ? "login" : "register";
  });

  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) { setError("Email and password are required"); return; }
    if (mode === "register" && !name.trim()) { setError("Organisation name is required"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }

    setLoading(true);
    try {
      const res = mode === "register"
        ? await register({ name: name.trim(), email: email.trim(), password })
        : await login({ email: email.trim(), password });

      setAuthToken(res.token);
      setStoredOrg(res.org);
      localStorage.setItem("sg_has_registered", "1");
      setSuccess(true);
      setTimeout(() => navigate({ to: "/" }), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div className="min-h-screen bg-background bg-radial-glow flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <img src="/guard.png" alt="SovereignGuard AI" className="h-20 w-auto object-contain" />
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {mode === "register" ? "Create your organisation" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "register"
                ? "Set up your SovereignGuard AI workspace"
                : "Sign in to your SovereignGuard AI dashboard"}
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-surface/60 backdrop-blur p-6 space-y-4">

          {success ? (
            <div className="flex flex-col items-center gap-3 py-6 text-primary">
              <CheckCircle2 className="h-12 w-12" />
              <p className="font-semibold text-lg">
                {mode === "register" ? "Organisation created!" : "Signed in!"}
              </p>
              <p className="text-sm text-muted-foreground">Redirecting to dashboard…</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              )}

              {mode === "register" && (
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Organisation Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Acme Corp"
                    className="mt-1.5 w-full h-11 px-4 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              )}

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="admin@company.com"
                  className="mt-1.5 w-full h-11 px-4 rounded-md bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder={mode === "register" ? "Min. 8 characters" : "Your password"}
                    className="w-full h-11 px-4 pr-11 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                onClick={submit}
                disabled={loading}
                className="w-full h-11 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition flex items-center justify-center gap-2 glow-emerald"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {mode === "register" ? "Create Organisation" : "Sign In"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {/* Mode toggle */}
              <div className="text-center pt-1">
                {mode === "register" ? (
                  <p className="text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <button
                      onClick={() => { setMode("login"); setError(null); }}
                      className="text-primary hover:underline font-medium"
                    >
                      Sign in
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    New organisation?{" "}
                    <button
                      onClick={() => { setMode("register"); setError(null); }}
                      className="text-primary hover:underline font-medium"
                    >
                      Create account
                    </button>
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Features */}
        {mode === "register" && !success && (
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "DPI Protection", sub: "Lobster Trap" },
              { label: "AI Formatting", sub: "Gemini 2.0" },
              { label: "SMTP Delivery", sub: "QSSN Relay" },
            ].map((f) => (
              <div key={f.label} className="rounded-lg border border-border bg-surface/40 p-3">
                <p className="text-xs font-semibold text-foreground">{f.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{f.sub}</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground">
          SovereignGuard AI · Enterprise Compliance & Trust Gateway
        </p>

        <PoweredBy />
      </div>
    </div>
  );
}
