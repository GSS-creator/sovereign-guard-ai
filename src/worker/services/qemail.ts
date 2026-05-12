/**
 * QSSN Mail Services Delivery
 *
 * Dispatches formatted HTML email via the QSSN Mail Services API.
 *
 * API base : https://qssn-d1-api.gastonsoftwaresolutions234.workers.dev
 * Endpoint : POST /api/v1/emails/send
 * Auth     : Bearer token in Authorization header
 *
 * Request body:
 *   { to, subject, html, from_name }
 *
 * Success response:
 *   { success: true, message_id, from, to }
 */

import type {
  CloudflareEnv,
  QEmailDeliveryRequest,
  QEmailDeliveryResponse,
} from '../../types/api';

const QSSN_ENDPOINT = 'https://qssn-d1-api.gastonsoftwaresolutions234.workers.dev/api/v1/emails/send';

export async function deliverViaQEmail(
  env: CloudflareEnv,
  payload: QEmailDeliveryRequest,
): Promise<QEmailDeliveryResponse> {
  const fromName = payload.from.includes('@')
    ? payload.from.split('@')[0].replace(/[._-]/g, ' ')
    : payload.from;

  const requestBody = {
    to: payload.to,
    subject: payload.subject,
    html: payload.html_body,
    from_name: fromName,
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.QEMAIL_AUTH_TOKEN}`,
  };

  let response: Response;
  try {
    if (env.QSSN_SERVICE) {
      // Use service binding — avoids same-account Worker HTTP 404
      const req = new Request('https://qssn-internal/api/v1/emails/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
      response = await env.QSSN_SERVICE.fetch(req);
    } else {
      // Fallback to direct HTTP (works in dev / external callers)
      response = await fetch(QSSN_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    }
  } catch (err) {
    console.error('[QSSN] Network error:', err);
    return { delivery_id: '', status: 'failed', error: 'Network error reaching QSSN relay' };
  }

  // Parse body regardless of status so we can surface the error message
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!response.ok || data.success === false) {
    const errMsg =
      typeof data.error === 'string'
        ? data.error
        : `QSSN relay returned HTTP ${response.status}`;
    console.error('[QSSN] Delivery failed:', errMsg);
    return {
      delivery_id: '',
      status: 'failed',
      error: errMsg,
    };
  }

  return {
    delivery_id: (data.message_id as string) ?? '',
    status: 'sent',
  };
}
