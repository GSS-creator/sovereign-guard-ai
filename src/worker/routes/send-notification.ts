/**
 * POST /v1/send-secure-notification
 *
 * Pipeline:
 *  1. Validate & parse request body
 *  2. DPI via Lobster Trap proxy
 *  3. Format HTML via Gemini API
 *  4. Deliver via QEmail Smart Connect
 *  5. Write audit log to KV
 */

import type {
  CloudflareEnv,
  SendSecureNotificationRequest,
  SendSecureNotificationResponse,
  NotificationSubtype,
} from '../../types/api';
import { SUBTYPE_POLICY_MAP, ALL_SUBTYPES } from '../../types/api';
import { runDPI } from '../services/lobster-trap';
import { formatWithGemini } from '../services/gemini';
import { deliverViaQEmail } from '../services/qemail';
import { writeAuditLog } from '../services/audit';
import { loadOrgKeys } from './settings';
import {
  generateTransactionId,
  isValidEmail,
  isValidPolicyType,
  jsonResponse,
  parseJsonBody,
} from '../utils';

const DEFAULT_SENDER = 'security@gss-tec.com';

export async function handleSendSecureNotification(
  request: Request,
  env: CloudflareEnv,
  orgId: string,
): Promise<Response> {  // ── 1. Parse & validate ──────────────────────────────────────────────────
  const body = await parseJsonBody<SendSecureNotificationRequest>(request);

  if (!body) {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const { recipient_email, sender_id, policy_type, notification_subtype, raw_prompt_input, template_context } = body;

  if (!recipient_email || !isValidEmail(recipient_email)) {
    return jsonResponse({ success: false, error: 'Invalid or missing recipient_email' }, 400);
  }

  // Resolve policy_type: can be provided directly OR inferred from notification_subtype
  let resolvedPolicyType = policy_type;
  let resolvedSubtype: NotificationSubtype | undefined = notification_subtype;

  if (notification_subtype) {
    if (!ALL_SUBTYPES.includes(notification_subtype)) {
      return jsonResponse(
        { success: false, error: `Invalid notification_subtype. Must be one of: ${ALL_SUBTYPES.join(', ')}` },
        400,
      );
    }
    // Subtype overrides policy_type
    resolvedPolicyType = SUBTYPE_POLICY_MAP[notification_subtype];
  } else if (!policy_type || !isValidPolicyType(policy_type)) {
    return jsonResponse(
      { success: false, error: 'Invalid policy_type. Must be soc2 | hipaa | security, or provide notification_subtype' },
      400,
    );
  }
  if (!raw_prompt_input?.trim()) {
    return jsonResponse({ success: false, error: 'raw_prompt_input is required' }, 400);
  }
  if (!template_context?.subject?.trim()) {
    return jsonResponse({ success: false, error: 'template_context.subject is required' }, 400);
  }

  const transactionId = generateTransactionId();
  const sender = sender_id?.trim() || DEFAULT_SENDER;
  const timestamp = new Date().toISOString();

  // ── Load org's own API keys ──────────────────────────────────────────────
  const orgKeys = await loadOrgKeys(env, orgId);

  // Build a runtime env that overlays org keys on top of Worker defaults
  const runtimeEnv: CloudflareEnv = {
    ...env,
    GEMINI_API_KEY:    orgKeys.gemini_api_key  ?? env.GEMINI_API_KEY,
    QEMAIL_AUTH_TOKEN: orgKeys.qemail_api_key  ?? env.QEMAIL_AUTH_TOKEN,
  };

  // ── Geo from Cloudflare cf object (free, no API key needed) ─────────────
  const cf = (request as Request & { cf?: { country?: string; city?: string } }).cf;
  const country = cf?.country ?? 'XX';
  const city    = cf?.city;

  // ── 2. Deep Prompt Inspection ────────────────────────────────────────────
  // Lobster Trap is shared infrastructure — always uses the Worker's env
  const dpiResult = await runDPI(env, {
    text: raw_prompt_input,
    policy_type: resolvedPolicyType,
  });

  if (!dpiResult.passed) {
    await writeAuditLog(env, {
      transaction_id: transactionId,
      timestamp,
      recipient_email,
      sender_id: sender,
      policy_type: resolvedPolicyType,
      notification_subtype: resolvedSubtype,
      dpi_passed: false,
      threat_score: dpiResult.threat_score,
      delivery_status: 'blocked',
      country,
      city,
      error: `DPI blocked — threat score: ${dpiResult.threat_score}`,
      org_id: orgId,
    });

    const response: SendSecureNotificationResponse = {
      success: false,
      transaction_id: transactionId,
      status: 'failed',
      dpi_result: dpiResult,
      gemini_formatted: false,
      error: `Content blocked by DPI. Threat score: ${dpiResult.threat_score}`,
    };
    return jsonResponse(response, 422);
  }

  // ── 3. Gemini Content Generation ────────────────────────────────────────
  // Gemini generates polished plain-text notification content.
  // QEmail Smart Connect handles HTML rendering and delivery.
  const sanitisedText = dpiResult.sanitized_text ?? raw_prompt_input;

  // Truncate large payloads — Gemini works best under 4000 chars.
  // For large datasets (CSV, reports) we send the first 3500 chars which
  // gives Gemini enough context to summarise the content intelligently.
  const MAX_GEMINI_INPUT = 6000;
  const geminiInput = sanitisedText.length > MAX_GEMINI_INPUT
    ? sanitisedText.slice(0, MAX_GEMINI_INPUT) + `\n\n[Dataset truncated — ${sanitisedText.length} total characters. Analyse and interpret the above data fully.]`
    : sanitisedText;

  let geminiResult: { html_content: string; formatted: boolean };
  try {
    geminiResult = await formatWithGemini(runtimeEnv, {
      text: geminiInput,
      subject: template_context.subject,
      client_name: template_context.client_name,
      notification_subtype: resolvedSubtype,
    });
  } catch (geminiErr) {
    const errMsg = geminiErr instanceof Error ? geminiErr.message : 'Gemini generation failed';
    console.error('[Pipeline] Gemini failed:', errMsg);

    // Log the failure and return an error — no fallback
    await writeAuditLog(env, {
      transaction_id: transactionId,
      timestamp,
      recipient_email,
      sender_id: sender,
      policy_type: resolvedPolicyType,
      notification_subtype: resolvedSubtype,
      dpi_passed: true,
      threat_score: dpiResult.threat_score,
      delivery_status: 'failed',
      country,
      city,
      error: `Gemini failed: ${errMsg}`,
      org_id: orgId,
    });

    return jsonResponse({
      success: false,
      transaction_id: transactionId,
      status: 'failed',
      dpi_result: dpiResult,
      gemini_formatted: false,
      error: `Content generation failed: ${errMsg}`,
    } satisfies SendSecureNotificationResponse, 502);
  }

  // ── 4. QEmail Smart Connect Delivery ────────────────────────────────────
  // Convert Gemini's plain-text paragraphs into clean HTML for QEmail to deliver.
  const emailHtml = geminiResult.html_content
    .split(/\n{2,}/)                          // split on blank lines (paragraph breaks)
    .map((para) => para.trim())
    .filter((para) => para.length > 0)
    .map((para) =>
      `<p style="margin:0 0 18px;line-height:1.8;color:#1e293b;font-size:15px;font-family:Inter,Arial,sans-serif">${para.replace(/\n/g, '<br>')}</p>`
    )
    .join('\n');

  // Wrap in a clean email shell
  const emailBody = `
<div style="max-width:620px;margin:0 auto;background:#ffffff;font-family:Inter,Arial,sans-serif;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:#0f172a;padding:28px 32px">
    <img src="https://sovereign-guard-ai.gastonsoftwaresolutions234.workers.dev/guard.png" alt="SovereignGuard AI" style="height:48px;width:auto;object-fit:contain" />
  </div>
  <div style="padding:36px 32px 28px">
    ${emailHtml}
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px">
    <p style="margin:0 0 12px;font-size:12px;color:#64748b;font-family:Inter,Arial,sans-serif;text-align:center;font-weight:600;letter-spacing:0.05em;text-transform:uppercase">
      Powered by
    </p>
    <table style="width:100%;border-collapse:collapse" cellpadding="0" cellspacing="0">
      <tr>
        <td style="text-align:center;padding:4px 6px">
          <a href="https://cloudflare.com" style="display:inline-block;font-size:11px;color:#475569;text-decoration:none;font-family:Inter,Arial,sans-serif">&#9729;&#65039; Cloudflare</a>
        </td>
        <td style="text-align:center;padding:4px 6px">
          <a href="https://smartconnect.gss-tec.com" style="display:inline-block;font-size:11px;color:#475569;text-decoration:none;font-family:Inter,Arial,sans-serif">&#9993;&#65039; QEmail Smart Connect</a>
        </td>
        <td style="text-align:center;padding:4px 6px">
          <a href="https://www.gss-tec.com" style="display:inline-block;font-size:11px;color:#475569;text-decoration:none;font-family:Inter,Arial,sans-serif">&#127970; GSS-TEC</a>
        </td>
        <td style="text-align:center;padding:4px 6px">
          <a href="https://deepmind.google/technologies/gemini/" style="display:inline-block;font-size:11px;color:#475569;text-decoration:none;font-family:Inter,Arial,sans-serif">&#10024; Gemini</a>
        </td>
      </tr>
      <tr>
        <td style="text-align:center;padding:4px 6px">
          <a href="https://www.veea.com/" style="display:inline-block;font-size:11px;color:#475569;text-decoration:none;font-family:Inter,Arial,sans-serif">&#128737;&#65039; Lobster Trap by Veea</a>
        </td>
        <td style="text-align:center;padding:4px 6px">
          <a href="https://gmail.com" style="display:inline-block;font-size:11px;color:#475569;text-decoration:none;font-family:Inter,Arial,sans-serif">&#128231; Google Gmail</a>
        </td>
        <td style="text-align:center;padding:4px 6px">
          <a href="https://lablab.ai" style="display:inline-block;font-size:11px;color:#475569;text-decoration:none;font-family:Inter,Arial,sans-serif">&#129302; Lablab.ai</a>
        </td>
        <td style="text-align:center;padding:4px 6px"></td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;font-family:Inter,Arial,sans-serif;text-align:center">
      SovereignGuard AI &mdash; Enterprise Compliance &amp; Trust Gateway
    </p>
    <p style="margin:8px 0 0;font-size:11px;color:#cbd5e1;font-family:Inter,Arial,sans-serif;text-align:center">
      📬 If you don&apos;t see this email in your inbox, please check your <strong>spam or junk folder</strong>.
    </p>
  </div>
</div>`.trim();

  const deliveryResult = await deliverViaQEmail(runtimeEnv, {
    to: recipient_email,
    from: sender,
    subject: template_context.subject,
    html_body: emailBody,
    policy_type: resolvedPolicyType,
  });

  const deliveryStatus = deliveryResult.status === 'sent' ? 'delivered' : 'failed';

  // ── 5. Audit Log ─────────────────────────────────────────────────────────
  await writeAuditLog(env, {
    transaction_id: transactionId,
    timestamp,
    recipient_email,
    sender_id: sender,
    policy_type: resolvedPolicyType,
    notification_subtype: resolvedSubtype,
    dpi_passed: true,
    threat_score: dpiResult.threat_score,
    delivery_status: deliveryStatus,
    country,
    city,
    error: deliveryResult.error,
    org_id: orgId,
  });

  // ── Response ─────────────────────────────────────────────────────────────
  const response: SendSecureNotificationResponse = {
    success: deliveryStatus === 'delivered',
    transaction_id: transactionId,
    status: deliveryStatus,
    dpi_result: dpiResult,
    gemini_formatted: geminiResult.formatted,
    gemini_content: geminiResult.html_content,
    qemail_delivery_id: deliveryResult.delivery_id || undefined,
    error: deliveryResult.error,
  };

  return jsonResponse(response, deliveryStatus === 'delivered' ? 200 : 502);
}
