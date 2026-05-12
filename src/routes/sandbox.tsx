import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Topbar } from "@/components/Topbar";
import { Upload, FileText, Play, Loader2, CheckCircle2, ShieldCheck, Sparkles, Send, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { sendSecureNotification } from "@/lib/api-client";
import { getOrgSettings } from "@/lib/api-client";
import type { PolicyType, NotificationSubtype } from "@/types/api";
import type { SendSecureNotificationResponse } from "@/types/api";
import { SetupBanner } from "@/components/SetupBanner";

export const Route = createFileRoute("/sandbox")({
  component: SandboxPage,
  head: () => ({ meta: [{ title: "Interactive Sandbox — SovereignGuard AI" }] }),
});

type Intent = "payment" | "clinical" | "ops";

const intentToPolicyType: Record<Intent, PolicyType> = {
  payment: "soc2",
  clinical: "hipaa",
  ops: "security",
};

// All 13 subtypes grouped by intent for the sandbox send call
const intentToSubtypes: Record<Intent, { value: string; label: string }[]> = {
  payment: [
    { value: "receipt",          label: "Receipt" },
    { value: "invoice",          label: "Invoice" },
    { value: "billing_reminder", label: "Billing Reminder" },
    { value: "payout",           label: "Payout" },
    { value: "refund",           label: "Refund" },
  ],
  clinical: [
    { value: "lab_results",  label: "Lab Results" },
    { value: "appointment",  label: "Appointment" },
    { value: "rx_refill",    label: "Rx Refill" },
    { value: "care_update",  label: "Care Update" },
  ],
  ops: [
    { value: "order_status",     label: "Order Status" },
    { value: "onboarding",       label: "Onboarding" },
    { value: "account_activity", label: "Account Activity" },
    { value: "report",           label: "Report" },
    { value: "alert",            label: "Alert" },
  ],
};

const intents: { id: Intent; label: string; description: string; theme: "green" | "blue" | "slate" }[] = [
  { id: "payment", label: "Payment Confirmation (SOC2 Policy Stack)", description: "Mask DB keys, hashes, internal routes", theme: "green" },
  { id: "clinical", label: "Clinical / Health Update (HIPAA Policy Stack)", description: "Redact PHI, ICD-10, patient identifiers", theme: "blue" },
  { id: "ops", label: "Business Operations (Standard Policy Stack)", description: "Standard adversarial filtering only", theme: "slate" },
];

const samplePayloads: Record<Intent, string> = {
  payment: "Transaction confirmed for Sarah Chen. Amount $2,450.00 charged. Internal DB key sk_live_4f8a2c91. Crypto hash 0x7B3D8F1A2C9E4B5D6F8A. Route: /v1/internal/admin/payouts/8821.",
  clinical: "Patient Robert Klein DOB 1978-04-12 (SSN 999-12-3456). Diagnosis: Type 2 Diabetes ICD-10 E11.9. Contact 415-555-0181. Continue Metformin 500mg.",
  ops: "Daily ops summary: 1,204 jobs, 99.7% success rate. 3 anomalies flagged for review.",
};

const sensitivePatterns = [
  /\b\d{3}-\d{2}-\d{4}\b/g,                // SSN
  /\b0x[A-Fa-f0-9]{8,}\b/g,                // hash
  /sk_live_[A-Za-z0-9]+/g,                 // db key
  /\bE\d{2}\.\d\b/g,                        // ICD-10
  /\b\d{3}-\d{3}-\d{4}\b/g,                 // phone
  /\bDOB \d{4}-\d{2}-\d{2}\b/g,             // dob
  /\/v1\/internal\/[A-Za-z0-9/_-]+/g,       // routes
  /\bRobert Klein\b|\bSarah Chen\b/g,       // names
];

function highlightInput(text: string) {
  let result = text;
  let parts: { t: string; sensitive: boolean }[] = [{ t: text, sensitive: false }];
  for (const re of sensitivePatterns) {
    parts = parts.flatMap((p) => {
      if (p.sensitive) return [p];
      const out: typeof parts = [];
      let last = 0;
      const s = p.t;
      let m: RegExpExecArray | null;
      const r = new RegExp(re.source, "g");
      while ((m = r.exec(s)) !== null) {
        if (m.index > last) out.push({ t: s.slice(last, m.index), sensitive: false });
        out.push({ t: m[0], sensitive: true });
        last = m.index + m[0].length;
      }
      if (last < s.length) out.push({ t: s.slice(last), sensitive: false });
      return out;
    });
  }
  return parts;
}

function sanitize(text: string) {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED PII]")
    .replace(/\b0x[A-Fa-f0-9]{8,}\b/g, "[REDACTED HASH]")
    .replace(/sk_live_[A-Za-z0-9]+/g, "[REDACTED SYSTEM HASH]")
    .replace(/\bE\d{2}\.\d\b/g, "[REDACTED ICD]")
    .replace(/\b\d{3}-\d{3}-\d{4}\b/g, "[REDACTED PHONE]")
    .replace(/\bDOB \d{4}-\d{2}-\d{2}\b/g, "[REDACTED DOB]")
    .replace(/\/v1\/internal\/[A-Za-z0-9/_-]+/g, "[REDACTED ROUTE]")
    .replace(/\bRobert Klein\b|\bSarah Chen\b/g, "[REDACTED NAME]");
}

function buildEmail(intent: Intent, sanitized: string) {
  if (intent === "clinical") {
    return `<div style="font-family:Inter,sans-serif;background:#eff6ff;padding:32px;border-radius:14px;border:1px solid #bfdbfe;color:#1e3a8a">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><div style="width:36px;height:36px;border-radius:8px;background:#1d4ed8;display:flex;align-items:center;justify-content:center;color:white;font-weight:700">+</div><b style="font-size:18px">MedVault Health</b></div>
      <h2 style="margin:0 0 12px">Your care update is ready</h2>
      <p style="line-height:1.6;color:#1e40af">Your care team has reviewed your latest information and a summary is ready in your secure portal.</p>
      <div style="background:white;padding:14px;border-radius:8px;margin:16px 0;font-size:12px;color:#475569">${sanitized}</div>
      <a style="display:inline-block;background:#1d4ed8;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">View Securely</a>
    </div>`;
  }
  if (intent === "payment") {
    return `<div style="font-family:Inter,sans-serif;background:#f0fdf4;padding:32px;border-radius:14px;border:1px solid #bbf7d0;color:#14532d">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><div style="width:36px;height:36px;border-radius:8px;background:#059669;display:flex;align-items:center;justify-content:center;color:white;font-weight:700">$</div><b style="font-size:18px">Sovereign Pay</b></div>
      <h2 style="margin:0 0 12px">Payment Confirmed ✓</h2>
      <p style="line-height:1.6;color:#166534">Your transaction has been securely processed.</p>
      <div style="background:white;padding:14px;border-radius:8px;margin:16px 0;font-size:12px;color:#475569">${sanitized}</div>
      <a style="display:inline-block;background:#059669;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">View Receipt</a>
    </div>`;
  }
  return `<div style="font-family:Inter,sans-serif;background:#f8fafc;padding:32px;border-radius:14px;border:1px solid #e2e8f0;color:#0f172a">
    <h2 style="margin:0 0 12px">Operations Update</h2>
    <p style="line-height:1.6;color:#334155">${sanitized}</p>
  </div>`;
}

const steps = [
  { label: "Deep Prompt Inspection (Lobster Trap)", icon: ShieldCheck },
  { label: "Content generation (Gemini 2.5 Flash)", icon: Sparkles },
  { label: "HTML render & SMTP delivery (QEmail Smart Connect)", icon: Send },
];

function SandboxPage() {
  const [email, setEmail] = useState("ops@example.com");
  const [clientName, setClientName] = useState("");
  const [subject, setSubject] = useState("");
  const [intent, setIntent] = useState<Intent>("clinical");
  const [subtype, setSubtype] = useState("lab_results");
  const [payload, setPayload] = useState(samplePayloads.clinical);
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [done, setDone] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<SendSecureNotificationResponse | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState(true);
  const [qemailConfigured, setQemailConfigured] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string; kind: string } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const sanitized = sanitize(payload);
  const html = buildEmail(intent, sanitized);
  const parts = highlightInput(payload);

  // Check if org has configured their API keys
  useEffect(() => {
    getOrgSettings().then((r) => {
      setGeminiConfigured(r.settings.gemini_configured);
      setQemailConfigured(r.settings.qemail_configured);
    }).catch(() => {});
  }, []);

  const onIntentChange = (i: Intent) => {    setIntent(i);
    setSubtype(intentToSubtypes[i][0].value);
    setPayload(samplePayloads[i]);
    setDone(false);
    setFileInfo(null);
    setFileError(null);
  };

  const handleRun = async () => {
    if (!email.trim() || !email.includes("@")) { setApiError("A valid recipient email is required"); return; }
    if (!subject.trim()) { setApiError("Email subject is required"); return; }
    setRunning(true); setDone(false); setStepIdx(0); setApiError(null); setApiResult(null);

    try {
      // Step 0 — DPI (visual, real DPI happens inside the worker)
      setStepIdx(0);
      await new Promise((r) => setTimeout(r, 600));

      // Step 1 — Gemini content generation (visual)
      setStepIdx(1);

      // Step 2 — Send via real API (all three steps happen server-side)
      setStepIdx(2);
      const result = await sendSecureNotification({
        recipient_email: email,
        policy_type: intentToPolicyType[intent],
        notification_subtype: subtype as NotificationSubtype,
        raw_prompt_input: payload,
        template_context: {
          subject: subject.trim() || intents.find((i) => i.id === intent)?.label || "Notification",
          client_name: clientName.trim() || undefined,
        },
      });

      setApiResult(result);
      setStepIdx(steps.length);
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setApiError(msg);
      setStepIdx(-1);
    } finally {
      setRunning(false);
    }
  };

  const formatSize = (b: number) =>
    b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

  const MAX_BYTES = 15 * 1024 * 1024;
  const MAX_CHARS = 20000;

  const handleFile = async (file: File) => {
    setFileError(null);
    setDone(false);
    if (file.size > MAX_BYTES) {
      setFileError(`File exceeds 15 MB limit (${formatSize(file.size)})`);
      return;
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    setParsing(true);
    setFileInfo({ name: file.name, size: formatSize(file.size), kind: ext.toUpperCase() });

    try {
      let text = "";

      if (ext === "pdf" || file.type === "application/pdf") {
        const pdfjs: any = await import("pdfjs-dist");
        const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        const buf = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        const pages: string[] = [];
        const max = Math.min(pdf.numPages, 50);
        for (let p = 1; p <= max; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          pages.push(content.items.map((it: any) => it.str).join(" "));
        }
        text = pages.join("\n\n");
        if (pdf.numPages > 50) text += `\n\n[Truncated — ${pdf.numPages - 50} additional pages not parsed]`;
      } else if (ext === "xlsx" || ext === "xls") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const chunks: string[] = [];
        wb.SheetNames.forEach((sn) => {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn]);
          if (csv.trim()) chunks.push(`### Sheet: ${sn}\n${csv}`);
        });
        text = chunks.join("\n\n");
      } else if (ext === "csv" || ext === "txt" || ext === "md" || ext === "json" || file.type.startsWith("text/")) {
        text = await file.text();
      } else {
        throw new Error(`Unsupported file type ".${ext}". Use PDF, CSV, TXT, or Excel (.xlsx).`);
      }

      const cleaned = text.replace(/\r\n/g, "\n").trim();
      if (!cleaned) throw new Error("File appears to be empty or contains no extractable text.");

      const truncated = cleaned.length > MAX_CHARS;
      setPayload(truncated ? cleaned.slice(0, MAX_CHARS) + "\n\n[Truncated — payload exceeds 20k chars]" : cleaned);
    } catch (err: any) {
      console.error("File parse error:", err);
      setFileError(err?.message || "Failed to parse file. Please try a different format.");
      setFileInfo(null);
    } finally {
      setParsing(false);
    }
  };

  const clearFile = () => {
    setFileInfo(null);
    setFileError(null);
    setPayload(samplePayloads[intent]);
  };

  return (
    <>
      <Topbar title="Interactive Sandbox" subtitle="Dry-run any payload through the full Sovereign Trust pipeline" />
      <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-auto">

        {/* Setup banner — compact, shown when keys are missing */}
        {(!geminiConfigured || !qemailConfigured) && (
          <SetupBanner
            geminiConfigured={geminiConfigured}
            qemailConfigured={qemailConfigured}
            compact
          />
        )}
        {/* Step 1 */}
        <Card step="01" title="Intent & Destination" desc="Pick the policy stack and fill in the recipient details.">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Recipient Email <span className="text-danger">*</span></label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="recipient@company.com"
                className="mt-2 w-full h-11 px-4 rounded-md bg-background border border-border font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Client / Recipient Name</label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Jane Doe  (used in greeting)"
                className="mt-2 w-full h-11 px-4 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Email Subject <span className="text-danger">*</span></label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Your Lab Results Are Ready"
                className="mt-2 w-full h-11 px-4 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Notification Intent</label>
              <select
                value={intent}
                onChange={(e) => onIntentChange(e.target.value as Intent)}
                className="mt-2 w-full h-11 px-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {intents.map((i) => (<option key={i.id} value={i.id}>{i.label}</option>))}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">{intents.find((i) => i.id === intent)?.description}</p>
            </div>
          </div>
          {/* Subtype selector */}
          <div className="mt-4">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Notification Subtype</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {intentToSubtypes[intent].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSubtype(s.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium border transition",
                    subtype === s.value
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-surface-elevated/40 text-muted-foreground border-border hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Step 2 */}
        <Card step="02" title="Payload Ingestion" desc="Paste raw notes, or drop a CSV/PDF for the Trap to inspect.">
          <div className="grid md:grid-cols-2 gap-4">
            <textarea
              value={payload}
              onChange={(e) => { setPayload(e.target.value); setDone(false); }}
              rows={8}
              className="w-full p-4 rounded-md bg-background border border-border font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              placeholder="Paste raw clinical notes, payment data, or operational text…"
            />
            <div className="space-y-2">
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
                }}
                className={cn(
                  "rounded-md border-2 border-dashed flex flex-col items-center justify-center text-center p-6 cursor-pointer transition",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-background/40",
                  parsing && "opacity-70 pointer-events-none",
                )}
              >
                <input
                  type="file"
                  accept=".csv,.txt,.pdf,.xlsx,.xls,.json,.md,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }}
                />
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                </div>
                <p className="text-sm font-medium">
                  {parsing ? "Extracting & inspecting…" : "Drop a PDF / CSV / Excel / TXT"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {parsing ? "Parsing client-side — nothing leaves your browser" : "or click to browse — up to 15 MB, files are inspected, never stored"}
                </p>
                <div className="flex flex-wrap gap-2 mt-4 text-[10px] text-muted-foreground justify-center">
                  <span className="px-2 py-0.5 rounded border border-border">PDF</span>
                  <span className="px-2 py-0.5 rounded border border-border">CSV</span>
                  <span className="px-2 py-0.5 rounded border border-border">XLSX</span>
                  <span className="px-2 py-0.5 rounded border border-border">XLS</span>
                  <span className="px-2 py-0.5 rounded border border-border">TXT</span>
                </div>
              </label>

              {fileInfo && !fileError && (
                <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 animate-fade-up">
                  <div className="h-8 w-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{fileInfo.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {fileInfo.kind} · {fileInfo.size} · parsed ✓
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); clearFile(); }}
                    className="h-7 w-7 rounded-md hover:bg-surface-elevated flex items-center justify-center text-muted-foreground hover:text-foreground transition"
                    aria-label="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {fileError && (
                <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger animate-fade-up">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{fileError}</span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Step 3 */}
        <Card step="03" title="Dry-Run Execution" desc="Watch each layer fire in real time.">
          <button
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition glow-emerald"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Processing…" : "Process & Route Safely"}
          </button>

          {(running || done || apiError) && (
            <div className="mt-5 space-y-2">
              {apiError && (
                <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger animate-fade-up">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{apiError}</span>
                </div>
              )}
              {steps.map((s, i) => {
                const Icon = s.icon;
                const state = i < stepIdx ? "done" : i === stepIdx && running ? "active" : i < stepIdx || done ? "done" : "pending";
                return (
                  <div key={i} className={cn(
                    "flex items-center gap-3 p-3 rounded-md border transition",
                    state === "done" && "border-primary/30 bg-primary/5",
                    state === "active" && "border-primary/50 bg-primary/10",
                    state === "pending" && "border-border bg-surface/40 opacity-60",
                  )}>
                    <div className={cn(
                      "h-8 w-8 rounded-md flex items-center justify-center",
                      state === "done" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground",
                    )}>
                      {state === "done" ? <CheckCircle2 className="h-4 w-4" /> :
                        state === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> :
                        <Icon className="h-4 w-4" />}
                    </div>
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">{state}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Results */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Panel 1 — Raw input with sensitive highlights */}
          <PanelLabel title="Raw Input" tone="danger" caption="Sensitive values highlighted">
            <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed">
              {parts.map((p, i) => p.sensitive ? (
                <mark key={i} className="bg-warning/30 text-warning-foreground rounded px-0.5">{p.t}</mark>
              ) : <span key={i}>{p.t}</span>)}
            </pre>
          </PanelLabel>

          {/* Panel 2 — Real DPI sanitized output from backend */}
          <PanelLabel
            title="DPI Sanitized"
            tone="warning"
            caption={apiResult ? `Threat score: ${apiResult.dpi_result.threat_score}` : "After Lobster Trap inspection"}
          >
            {apiResult ? (
              <div className="space-y-3">
                {/* DPI verdict badge */}
                <div className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold",
                  apiResult.dpi_result.passed
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-danger/10 text-danger border-danger/30"
                )}>
                  {apiResult.dpi_result.passed ? "✓ Passed DPI" : "✗ Blocked by DPI"}
                </div>
                {/* Sanitized text */}
                <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed">
                  {apiResult.dpi_result.sanitized_text
                    ? apiResult.dpi_result.sanitized_text
                        .split(/(\[REDACTED[^\]]*\])/g)
                        .map((seg: string, i: number) =>
                          seg.startsWith("[REDACTED")
                            ? <span key={i} className="bg-primary/20 text-primary rounded px-1 py-0.5 mx-0.5 font-semibold">{seg}</span>
                            : <span key={i}>{seg}</span>
                        )
                    : sanitized.split(/(\[REDACTED [^\]]+\])/g).map((seg, i) =>
                        seg.startsWith("[REDACTED")
                          ? <span key={i} className="bg-primary/20 text-primary rounded px-1 py-0.5 mx-0.5 font-semibold">{seg}</span>
                          : <span key={i}>{seg}</span>
                      )
                  }
                </pre>
                {/* Flagged patterns */}
                {apiResult.dpi_result.flagged_patterns && apiResult.dpi_result.flagged_patterns.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {apiResult.dpi_result.flagged_patterns.map((p) => (
                      <span key={p} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">{p}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed">
                {sanitized.split(/(\[REDACTED [^\]]+\])/g).map((seg, i) =>
                  seg.startsWith("[REDACTED")
                    ? <span key={i} className="bg-primary/20 text-primary rounded px-1 py-0.5 mx-0.5 font-semibold">{seg}</span>
                    : <span key={i}>{seg}</span>
                )}
              </pre>
            )}
          </PanelLabel>

          {/* Panel 3 — Real Gemini model response */}
          <PanelLabel
            title="Gemini Response"
            tone="primary"
            caption={apiResult?.gemini_formatted ? "Generated by Gemini 2.5 Flash" : "Fallback content"}
          >
            {apiResult ? (
              <div className="space-y-3">
                {/* Status badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold",
                    apiResult.status === "delivered"
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-danger/10 text-danger border-danger/30"
                  )}>
                    {apiResult.status === "delivered" ? "✓ Delivered" : "✗ Failed"}
                  </span>
                  {apiResult.gemini_formatted && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-chart-2/30 bg-chart-2/10 text-chart-2 text-[11px] font-semibold">
                      ✨ Gemini 2.5 Flash
                    </span>
                  )}
                </div>

                {/* The actual message Gemini wrote — what the user receives */}
                {apiResult.gemini_content && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                      Message sent to recipient
                    </p>
                    <div className="space-y-3">
                      {apiResult.gemini_content
                        .split(/\n{2,}/)
                        .map((para) => para.trim())
                        .filter((para) => para.length > 0)
                        .map((para, i) => (
                          <p key={i} className="text-sm leading-relaxed text-foreground">
                            {para}
                          </p>
                        ))
                      }
                    </div>
                  </div>
                )}

                {/* Delivery metadata */}
                <div className="space-y-1">
                  {apiResult.qemail_delivery_id && (
                    <p className="text-[10px] font-mono text-muted-foreground">
                      📧 {apiResult.qemail_delivery_id} → {email}
                    </p>
                  )}
                  <p className="text-[10px] font-mono text-muted-foreground">
                    TX: {apiResult.transaction_id}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                    <span>📬</span>
                    <span>Don&apos;t see it? Check your <strong className="text-foreground">spam or junk folder</strong>.</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                <Sparkles className="h-8 w-8 opacity-30" />
                <p className="text-xs">Run the pipeline to see Gemini's response</p>
              </div>
            )}
          </PanelLabel>
        </div>
      </div>
    </>
  );
}

function Card({ step, title, desc, children }: { step: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 backdrop-blur p-4 sm:p-6">
      <div className="flex items-start gap-4 mb-5">
        <div className="font-mono text-xs text-primary border border-primary/40 rounded px-2 py-1">{step}</div>
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function PanelLabel({ title, tone, caption, children }: { title: string; tone: "primary" | "danger" | "warning"; caption: string; children: React.ReactNode }) {
  const toneCls = {
    primary: "border-primary/30",
    danger: "border-danger/30",
    warning: "border-warning/30",
  }[tone];
  const dot = {
    primary: "bg-primary",
    danger: "bg-danger",
    warning: "bg-warning",
  }[tone];
  return (
    <div className={cn("rounded-xl border bg-surface/50 backdrop-blur overflow-hidden", toneCls)}>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
          <p className="text-xs font-semibold uppercase tracking-wider">{title}</p>
        </div>
        <p className="text-[10px] text-muted-foreground">{caption}</p>
      </div>
      <div className="p-4 max-h-[320px] overflow-auto">{children}</div>
    </div>
  );
}
