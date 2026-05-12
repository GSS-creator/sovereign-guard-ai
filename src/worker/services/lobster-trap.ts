/**
 * Lobster Trap DPI Service
 *
 * Pipes raw prompt text through the Veea Lobster Trap proxy (hosted on
 * Hugging Face Spaces) for deep prompt inspection before any downstream
 * processing.  The proxy returns a threat score and optional flagged
 * patterns; text that passes is returned sanitised and ready for Gemini.
 */

import type {
  CloudflareEnv,
  LobsterTrapDPIRequest,
  LobsterTrapDPIResponse,
} from '../../types/api';

export async function runDPI(
  env: CloudflareEnv,
  payload: LobsterTrapDPIRequest,
): Promise<LobsterTrapDPIResponse> {
  const url = `${env.LOBSTER_TRAP_URL}/inspect`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[LobsterTrap] Network error:', err);
    // Fail-open with a high threat score so the caller can decide
    return {
      passed: false,
      threat_score: 1.0,
      flagged_patterns: ['NETWORK_ERROR'],
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`[LobsterTrap] Non-OK response ${response.status}: ${text}`);
    return {
      passed: false,
      threat_score: 1.0,
      flagged_patterns: [`HTTP_${response.status}`],
    };
  }

  const result = (await response.json()) as LobsterTrapDPIResponse;
  return result;
}
