/**
 * POST /v1/inspect
 *
 * Thin passthrough to the Lobster Trap DPI service.
 * Used by the Interactive Sandbox to show live DPI results
 * without going through the full send pipeline.
 */

import type { CloudflareEnv, LobsterTrapDPIRequest } from "../../types/api";
import { runDPI } from "../services/lobster-trap";
import { isValidPolicyType, jsonResponse, parseJsonBody } from "../utils";

export async function handleInspect(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  const body = await parseJsonBody<LobsterTrapDPIRequest>(request);

  if (!body?.text?.trim()) {
    return jsonResponse({ error: "text is required" }, 400);
  }

  if (body.policy_type && !isValidPolicyType(body.policy_type)) {
    return jsonResponse(
      { error: "Invalid policy_type. Must be soc2 | hipaa | security" },
      400,
    );
  }

  const result = await runDPI(env, {
    text: body.text,
    policy_type: body.policy_type ?? "security",
  });

  return jsonResponse(result);
}
