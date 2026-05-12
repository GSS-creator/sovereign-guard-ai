import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleGatewayRequest } from "./worker/gateway";
import type { CloudflareEnv } from "./types/api";

// ── Dev-mode env shim ─────────────────────────────────────────────────────────
// In Vite dev mode the second argument to fetch() is undefined — Cloudflare
// bindings only exist inside wrangler dev / a deployed Worker.
// We build a minimal shim from process.env (populated by .dev.vars via Vite)
// so the gateway can run locally without crashing.

// Also patch Node's TLS verification in dev so outbound fetches to Hugging Face
// and other HTTPS services work despite the corporate proxy certificate chain.
if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function buildDevEnv(raw: unknown): CloudflareEnv {
  const e = (raw ?? {}) as Record<string, unknown>;

  // KV stub — returns null for every key, silently ignores writes
  const kvStub = {
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
    list: async () => ({ keys: [], list_complete: true }),
  };

  return {
    LOBSTER_TRAP_URL:
      (e.LOBSTER_TRAP_URL as string) ??
      process.env.LOBSTER_TRAP_URL ??
      "",
    GEMINI_API_KEY:
      (e.GEMINI_API_KEY as string) ??
      process.env.GEMINI_API_KEY ??
      "",
    QEMAIL_AUTH_TOKEN:
      (e.QEMAIL_AUTH_TOKEN as string) ??
      process.env.QEMAIL_AUTH_TOKEN ??
      "",
    SOVEREIGN_GUARD_KV:
      (e.SOVEREIGN_GUARD_KV as CloudflareEnv["SOVEREIGN_GUARD_KV"]) ??
      kvStub,
    // D1 not available in Vite dev — services fall back to KV automatically
    sovereign_guard_db:
      (e.sovereign_guard_db as CloudflareEnv["sovereign_guard_db"]) ??
      (null as unknown as CloudflareEnv["sovereign_guard_db"]),
    // QSSN service binding not available in dev — falls back to HTTP fetch
    QSSN_SERVICE: (e.QSSN_SERVICE as CloudflareEnv["QSSN_SERVICE"]) ?? undefined,
  };
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // ── 1. Try the API gateway first ─────────────────────────────────────
      const gatewayResponse = await handleGatewayRequest(request, buildDevEnv(env));
      if (gatewayResponse) return gatewayResponse;

      // ── 2. Fall through to TanStack SSR ──────────────────────────────────
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
