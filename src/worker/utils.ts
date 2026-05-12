// Utility helpers for the SovereignGuard AI Gateway Worker

/**
 * Generate a unique transaction ID with a timestamp prefix.
 */
export function generateTransactionId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SGT-${timestamp}-${random}`;
}

/**
 * Build a standardised JSON response.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Powered-By': 'SovereignGuard-AI',
    },
  });
}

/**
 * Build a CORS-preflight response that allows the dashboard origin.
 */
export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Validate an email address with a simple regex.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate that a policy type is one of the accepted values.
 */
export function isValidPolicyType(policy: string): policy is 'soc2' | 'hipaa' | 'security' {
  return ['soc2', 'hipaa', 'security'].includes(policy);
}

/**
 * Safely parse a JSON body from a Request, returning null on failure.
 */
export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
