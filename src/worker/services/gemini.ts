/**
 * Gemini Content Generation Service
 *
 * Gemini's sole role: take sanitised plain text → return a polished
 * professional notification body (plain text, no HTML).
 *
 * No fallbacks. If Gemini fails the pipeline fails — the caller decides
 * whether to surface the error or retry.
 */

import type {
  CloudflareEnv,
  GeminiFormatRequest,
  GeminiFormatResponse,
  NotificationSubtype,
} from '../../types/api';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL    = 'gemini-2.5-flash';

// ── Subtype tone config ───────────────────────────────────────────────────────

interface SubtypeConfig {
  category: string;
  tone: string;
  cta: string;
}

const SUBTYPE_CONFIG: Record<NotificationSubtype, SubtypeConfig> = {
  receipt:          { category: 'Payment',  tone: 'warm and reassuring',           cta: 'View your receipt anytime'              },
  invoice:          { category: 'Payment',  tone: 'friendly and clear',            cta: 'Take a look and pay when ready'         },
  billing_reminder: { category: 'Payment',  tone: 'gentle and helpful',            cta: 'Update your details so nothing is missed' },
  payout:           { category: 'Payment',  tone: 'positive and celebratory',      cta: 'Check your payout details'              },
  refund:           { category: 'Payment',  tone: 'empathetic and reassuring',     cta: 'Track your refund progress'             },
  lab_results:      { category: 'Clinical', tone: 'calm, caring, and clear',       cta: 'View your results in your secure portal' },
  appointment:      { category: 'Clinical', tone: 'friendly and helpful',          cta: 'Manage your appointment at your convenience' },
  rx_refill:        { category: 'Clinical', tone: 'helpful and proactive',         cta: 'Request your refill so you never run out' },
  care_update:      { category: 'Clinical', tone: 'warm, caring, and supportive',  cta: 'Read your full care update'             },
  order_status:     { category: 'Business', tone: 'friendly and informative',      cta: 'Track your order in real time'          },
  onboarding:       { category: 'Business', tone: 'welcoming and enthusiastic',    cta: 'Get started — we\'re excited to have you' },
  account_activity: { category: 'Business', tone: 'helpful and security-aware',    cta: 'Review your recent activity'            },
  report:           { category: 'Business', tone: 'clear and insightful',          cta: 'Read the full report for all the details' },
  alert:            { category: 'Business', tone: 'calm but urgent',               cta: 'Take a look and let us know if you need help' },
};

const DEFAULT_CONFIG: SubtypeConfig = {
  category: 'Notification',
  tone: 'professional and concise',
  cta: 'View details',
};

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  subject: string,
  clientName: string | undefined,
  subtype: NotificationSubtype | undefined,
): string {
  const config   = subtype ? (SUBTYPE_CONFIG[subtype] ?? DEFAULT_CONFIG) : DEFAULT_CONFIG;
  const greeting = clientName ? `Hi ${clientName}` : 'Hi there';

  return `You are a warm, friendly personal assistant writing directly to a real person on behalf of SovereignGuard AI.

Your task: read the provided content (which may be raw data, CSV records, clinical measurements, reports, or plain text) and write a personalised, detailed message addressed directly to the recipient.

Tone & style:
- Speak directly to the person — use "you", "your", "we noticed", "we wanted to let you know".
- Be warm, supportive, and easy to understand. Avoid clinical jargon.
- If the data contains health metrics (BP, BMI, etc.), interpret EVERY metric in plain language — explain what each number means for them personally, whether it is normal, borderline, or concerning.
- If the data is a dataset or report, cover ALL key findings — do not stop after the first point.
- Be encouraging and action-oriented — help them understand what each finding means and what to do next.
- Do NOT truncate or cut off — write the complete, full response.

Format rules:
- Output PLAIN TEXT only — no HTML, no markdown, no bullet points, no formatting symbols.
- Start with: "${greeting},"
- Cover every significant data point in the input. Be thorough and complete.
- End with a friendly call-to-action: "${config.cta}."
- Category: ${config.category}. Type: ${subtype ?? 'general'}.
- Subject context: "${subject}"
- Do NOT reproduce raw UUIDs, internal IDs, or system identifiers.
- Do NOT add a sign-off or signature.`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface GeminiFormatRequestExtended extends GeminiFormatRequest {
  notification_subtype?: NotificationSubtype;
}

export async function formatWithGemini(
  env: CloudflareEnv,
  payload: GeminiFormatRequestExtended,
): Promise<GeminiFormatResponse> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

  const requestBody = {
    system_instruction: {
      parts: [{ text: buildSystemPrompt(payload.subject, payload.client_name, payload.notification_subtype) }],
    },
    contents: [{ role: 'user', parts: [{ text: payload.text }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  };

  // Retry up to 3 times on 429 rate limits only
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (err) {
      throw new Error(`Gemini network error (attempt ${attempt + 1}): ${String(err)}`);
    }

    // Rate limited — wait and retry
    if (response.status === 429) {
      const wait = parseInt(response.headers.get('Retry-After') ?? '5', 10);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini rate limit exceeded after ${attempt + 1} attempts: ${body}`);
    }

    // Any other non-OK response — fail immediately
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini HTTP ${response.status}: ${body}`);
    }

    type GeminiAPIResponse = {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const data = (await response.json()) as GeminiAPIResponse;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    // Return the model's plain-text response — QEmail handles HTML rendering
    return { html_content: text, formatted: true };
  }

  throw new Error('Gemini failed after 3 attempts');
}
