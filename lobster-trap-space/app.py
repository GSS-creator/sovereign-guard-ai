"""
SovereignGuard AI — Lobster Trap DPI Sidecar
=============================================
FastAPI application that:
  1. Loads the YAML policy ruleset from configs/policies.yaml
  2. Exposes POST /inspect — the endpoint called by the Cloudflare Worker
  3. Runs every ingress rule (DENY / REDACT) against the incoming text
  4. Returns a structured DPI result: { passed, threat_score, flagged_patterns, sanitized_text }

Port: 7860 (Hugging Face Docker Space standard)
"""

import re
import os
import yaml
import uvicorn

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

# ── App init ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SovereignGuard Lobster Trap Proxy",
    description="Deep Prompt Inspection (DPI) gateway for enterprise compliance",
    version="1.0.0",
)

# ── Policy loader ─────────────────────────────────────────────────────────────

POLICY_PATH = os.path.join(os.path.dirname(__file__), "configs", "policies.yaml")

def load_policy() -> dict:
    with open(POLICY_PATH, "r") as f:
        return yaml.safe_load(f)

POLICY = load_policy()
RULES: list[dict] = POLICY.get("ingress_rules", [])
DEFAULT_ACTION: str = POLICY.get("default_action", "ALLOW")

# ── Request / Response models ─────────────────────────────────────────────────

class InspectRequest(BaseModel):
    text: str
    policy_type: Optional[str] = "security"  # soc2 | hipaa | security

class DPIResult(BaseModel):
    passed: bool
    threat_score: float
    flagged_patterns: list[str]
    sanitized_text: str

# ── DPI engine ────────────────────────────────────────────────────────────────

REDACT_PLACEHOLDER = "[REDACTED]"

def run_inspection(text: str, policy_type: str) -> DPIResult:
    """
    Iterate every ingress rule in order.
    - DENY  → immediately fail with threat_score 1.0
    - REDACT → replace match in-place, accumulate partial threat score
    """
    flagged: list[str] = []
    sanitized = text
    threat_accumulator = 0.0
    rule_weight = 1.0 / max(len(RULES), 1)

    for rule in RULES:
        name: str = rule.get("name", "unnamed_rule")
        pattern: str = rule.get("pattern", "")
        action: str = rule.get("action", DEFAULT_ACTION)
        deny_message: str = rule.get("deny_message", f"Blocked by rule: {name}")

        if not pattern:
            continue

        try:
            compiled = re.compile(pattern)
        except re.error:
            # Bad regex in policy — skip silently, don't crash
            continue

        match = compiled.search(sanitized)
        if not match:
            continue

        flagged.append(name)

        if action == "DENY":
            # Hard block — return immediately with max threat score
            return DPIResult(
                passed=False,
                threat_score=1.0,
                flagged_patterns=flagged,
                sanitized_text=sanitized,
            )

        elif action == "REDACT":
            # Soft block — redact all occurrences and continue scanning
            sanitized = compiled.sub(REDACT_PLACEHOLDER, sanitized)
            threat_accumulator += rule_weight

    # Cap threat score at 0.99 for non-DENY results (passed = True)
    final_score = round(min(threat_accumulator, 0.99), 4)

    return DPIResult(
        passed=True,
        threat_score=final_score,
        flagged_patterns=flagged,
        sanitized_text=sanitized,
    )

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "SovereignGuard Lobster Trap Proxy",
        "version": "1.0.0",
        "status": "online",
        "policy": POLICY.get("policy_name", "unknown"),
        "rules_loaded": len(RULES),
    }

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "policy_loaded": bool(RULES),
        "rule_count": len(RULES),
        "default_action": DEFAULT_ACTION,
    }

@app.api_route("/favicon.ico", methods=["GET", "HEAD"])
async def favicon():
    """Suppress browser favicon 404 noise in logs."""
    from fastapi.responses import Response
    return Response(status_code=204)

@app.api_route("/ping", methods=["GET", "HEAD"])
async def ping():
    """
    Lightweight liveness probe for UptimeRobot (or any uptime monitor).
    Accepts both GET and HEAD — UptimeRobot uses HEAD by default.
    Returns 200 OK with a minimal JSON body — no policy evaluation,
    no file I/O. Configure your UptimeRobot monitor to hit this URL:
        https://gsstec-sovereign-guard-proxy.hf.space/ping
    Expected response: { "status": "pong" }
    """
    return {"status": "pong"}

@app.get("/policies")
async def get_policies():
    """
    Returns the full parsed ruleset as JSON so the Cloudflare Worker
    can proxy it to the dashboard without re-reading the YAML file.
    """
    return {
        "policy_name": POLICY.get("policy_name", "unknown"),
        "version": POLICY.get("version", "1.0"),
        "default_action": DEFAULT_ACTION,
        "rules": [
            {
                "name": r.get("name"),
                "group": r.get("group", "cyber"),
                "label": r.get("label", r.get("name")),
                "description": r.get("description", ""),
                "pattern": r.get("pattern", ""),
                "action": r.get("action", DEFAULT_ACTION),
                "deny_message": r.get("deny_message"),
                "enabled": r.get("enabled", True),
            }
            for r in RULES
        ],
    }

@app.post("/inspect", response_model=DPIResult)
async def inspect(payload: InspectRequest):
    """
    Main DPI endpoint — called by the Cloudflare Worker before every
    Gemini formatting or QEmail delivery operation.

    Request:
        { "text": "...", "policy_type": "soc2" | "hipaa" | "security" }

    Response:
        {
            "passed": true | false,
            "threat_score": 0.0 – 1.0,
            "flagged_patterns": ["rule_name", ...],
            "sanitized_text": "cleaned text with [REDACTED] substitutions"
        }
    """
    if not payload.text or not payload.text.strip():
        return DPIResult(
            passed=False,
            threat_score=1.0,
            flagged_patterns=["EMPTY_INPUT"],
            sanitized_text="",
        )

    result = run_inspection(payload.text, payload.policy_type or "security")
    return result

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "passed": False,
            "threat_score": 1.0,
            "flagged_patterns": ["INTERNAL_ERROR"],
            "sanitized_text": "",
            "error": str(exc),
        },
    )

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
