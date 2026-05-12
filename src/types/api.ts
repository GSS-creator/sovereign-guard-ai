// API Types for SovereignGuard AI Gateway

// ── Core policy groups (map to Lobster Trap DPI rule groups) ─────────────────
export type PolicyType = 'soc2' | 'hipaa' | 'security';

// ── Notification subtypes ─────────────────────────────────────────────────────
// Payment category (SOC2 policy group)
export type PaymentNotificationType =
  | 'receipt'
  | 'invoice'
  | 'billing_reminder'
  | 'payout'
  | 'refund';

// Clinical category (HIPAA policy group)
export type ClinicalNotificationType =
  | 'lab_results'
  | 'appointment'
  | 'rx_refill'
  | 'care_update';

// Business category (Security policy group)
export type BusinessNotificationType =
  | 'order_status'
  | 'onboarding'
  | 'account_activity'
  | 'report'
  | 'alert';

export type NotificationSubtype =
  | PaymentNotificationType
  | ClinicalNotificationType
  | BusinessNotificationType;

// Maps every subtype to its DPI policy group
export const SUBTYPE_POLICY_MAP: Record<NotificationSubtype, PolicyType> = {
  // Payment → SOC2
  receipt:          'soc2',
  invoice:          'soc2',
  billing_reminder: 'soc2',
  payout:           'soc2',
  refund:           'soc2',
  // Clinical → HIPAA
  lab_results:      'hipaa',
  appointment:      'hipaa',
  rx_refill:        'hipaa',
  care_update:      'hipaa',
  // Business → Security
  order_status:     'security',
  onboarding:       'security',
  account_activity: 'security',
  report:           'security',
  alert:            'security',
};

export const ALL_SUBTYPES = Object.keys(SUBTYPE_POLICY_MAP) as NotificationSubtype[];

export interface SendSecureNotificationRequest {
  recipient_email: string;
  sender_id?: string;
  policy_type: PolicyType;
  notification_subtype?: NotificationSubtype;  // optional — inferred from policy_type if omitted
  raw_prompt_input: string;
  template_context: {
    subject: string;
    client_name?: string;
  };
}

export interface SendSecureNotificationResponse {
  success: boolean;
  transaction_id: string;
  status: 'delivered' | 'pending' | 'failed';
  dpi_result: {
    passed: boolean;
    threat_score: number;
    flagged_patterns?: string[];
    sanitized_text?: string;
  };
  gemini_formatted: boolean;
  gemini_content?: string;   // the actual text Gemini generated
  qemail_delivery_id?: string;
  error?: string;
}

export interface LobsterTrapDPIRequest {
  text: string;
  policy_type: PolicyType;
}

export interface LobsterTrapDPIResponse {
  passed: boolean;
  threat_score: number;
  flagged_patterns?: string[];
  sanitized_text?: string;
}

export interface GeminiFormatRequest {
  text: string;
  subject: string;
  client_name?: string;
}

export interface GeminiFormatResponse {
  html_content: string;
  formatted: boolean;
}

export interface QEmailDeliveryRequest {
  to: string;
  from: string;
  subject: string;
  html_body: string;
  policy_type: PolicyType;
}

export interface QEmailDeliveryResponse {
  delivery_id: string;
  status: 'sent' | 'queued' | 'failed';
  error?: string;
}

export interface AuditLogEntry {
  transaction_id: string;
  org_id: string;
  timestamp: string;
  recipient_email: string;
  sender_id: string;
  policy_type: PolicyType;
  notification_subtype?: NotificationSubtype;
  dpi_passed: boolean;
  threat_score: number;
  delivery_status: string;
  country?: string;
  city?: string;
  error?: string;
}

export interface CloudflareEnv {
  // Environment variables
  LOBSTER_TRAP_URL: string;
  
  // Secrets
  GEMINI_API_KEY: string;
  QEMAIL_AUTH_TOKEN: string;
  
  // KV Namespace (policy overrides, webhooks, integrations config)
  SOVEREIGN_GUARD_KV: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
      keys: Array<{ name: string; expiration?: number }>;
      list_complete: boolean;
      cursor?: string;
    }>;
  };

  // D1 Database (audit logs, team members, activity, api keys)
  sovereign_guard_db: {
    prepare(query: string): D1PreparedStatement;
    exec(query: string): Promise<D1ExecResult>;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  };

  // QSSN Worker service binding (avoids same-account HTTP 404)
  QSSN_SERVICE?: {
    fetch(request: Request): Promise<Response>;
  };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { duration: number; rows_read: number; rows_written: number };
  error?: string;
}

interface D1ExecResult {
  count: number;
  duration: number;
}
