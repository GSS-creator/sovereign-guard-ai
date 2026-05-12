# SovereignGuard AI — Backend Architecture

## Overview

The backend is a **Cloudflare Worker** that acts as an edge-deployed API gateway. It coordinates secure, enterprise-compliant transactional notification flows by orchestrating three external services:

1. **Veea Lobster Trap** (Hugging Face Spaces) — Deep Prompt Inspection (DPI)
2. **Google Gemini 2.0 Flash** — HTML email formatting
3. **QSSN Mail Services** — SMTP delivery relay

All transactions are logged to **Cloudflare KV** for audit trail persistence.

---

## Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  POST /v1/send-secure-notification                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  1. Validate    │
                    │     Request     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  2. Lobster     │
                    │     Trap DPI    │◄─── Hugging Face Spaces
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Threat Score   │
                    │  < threshold?   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  3. Gemini      │
                    │     Format      │◄─── Google Gemini API
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  4. QSSN        │
                    │     Delivery    │◄─── QSSN Mail API
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  5. Write       │
                    │     Audit Log   │◄─── Cloudflare KV
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  JSON Response  │
                    └─────────────────┘
```

---

## File Structure

```
src/
├── types/
│   └── api.ts                          # TypeScript interfaces
│
├── worker/
│   ├── gateway.ts                      # Main router (intercepts /v1/*)
│   ├── utils.ts                        # Shared helpers
│   │
│   ├── routes/
│   │   ├── send-notification.ts        # POST /v1/send-secure-notification
│   │   ├── audit-logs.ts               # GET  /v1/audit-logs
│   │   └── health.ts                   # GET  /v1/health
│   │
│   └── services/
│       ├── lobster-trap.ts             # DPI via Veea Lobster Trap
│       ├── gemini.ts                   # HTML formatting via Gemini
│       ├── qemail.ts                   # Delivery via QSSN
│       └── audit.ts                    # KV read/write
│
└── server.ts                           # Entry point (gateway → SSR)
```

---

## Environment Bindings

### Variables (wrangler.jsonc)
```jsonc
"vars": {
  "LOBSTER_TRAP_URL": "https://your-space.hf.space"
}
```

### Secrets (set via CLI)
```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put QEMAIL_AUTH_TOKEN
```

### KV Namespace
```jsonc
"kv_namespaces": [
  {
    "binding": "SOVEREIGN_GUARD_KV",
    "id": "your-kv-namespace-id"
  }
]
```

---

## API Reference

### 1. Health Check

**Endpoint:** `GET /v1/health`

**Response:**
```json
{
  "status": "ok",
  "service": "SovereignGuard AI Gateway",
  "version": "1.0.0",
  "timestamp": "2026-05-12T09:00:00.000Z",
  "bindings": {
    "lobster_trap": true,
    "qemail": true,
    "gemini_key": true,
    "qemail_token": true,
    "kv": true
  }
}
```

---

### 2. Send Secure Notification

**Endpoint:** `POST /v1/send-secure-notification`

**Request Body:**
```json
{
  "recipient_email": "user@example.com",
  "sender_id": "security@gss-tec.com",
  "policy_type": "soc2",
  "raw_prompt_input": "Your account was accessed from a new device in San Francisco.",
  "template_context": {
    "subject": "Security Alert",
    "client_name": "John Doe"
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "transaction_id": "SGT-L8X9K2-A7B3C1",
  "status": "delivered",
  "dpi_result": {
    "passed": true,
    "threat_score": 0.12,
    "flagged_patterns": []
  },
  "gemini_formatted": true,
  "qemail_delivery_id": "msg_1234567890"
}
```

**Blocked by DPI (422):**
```json
{
  "success": false,
  "transaction_id": "SGT-L8X9K2-A7B3C1",
  "status": "failed",
  "dpi_result": {
    "passed": false,
    "threat_score": 0.87,
    "flagged_patterns": ["PROMPT_INJECTION", "SQL_INJECTION"]
  },
  "gemini_formatted": false,
  "error": "Content blocked by DPI. Threat score: 0.87"
}
```

---

### 3. Audit Logs

**Endpoint:** `GET /v1/audit-logs?limit=50`

**Response:**
```json
{
  "success": true,
  "count": 50,
  "logs": [
    {
      "transaction_id": "SGT-L8X9K2-A7B3C1",
      "timestamp": "2026-05-12T09:00:00.000Z",
      "recipient_email": "user@example.com",
      "sender_id": "security@gss-tec.com",
      "policy_type": "soc2",
      "dpi_passed": true,
      "threat_score": 0.12,
      "delivery_status": "delivered"
    }
  ]
}
```

---

## Service Integration Details

### Lobster Trap DPI
- **Endpoint:** `POST ${LOBSTER_TRAP_URL}/inspect`
- **Request:** `{ text, policy_type }`
- **Response:** `{ passed, threat_score, flagged_patterns?, sanitized_text? }`
- **Fail-open:** If the service is unreachable, returns `threat_score: 1.0` so the caller can decide

### Gemini 2.0 Flash
- **Endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- **Auth:** `?key=${GEMINI_API_KEY}`
- **System Prompt:** Instructs the model to output clean HTML with inline CSS, dark navy theme, emerald accents
- **Fallback:** If formatting fails, returns the raw text wrapped in `<p>` tags

### QSSN Mail Services
- **Endpoint:** `POST https://qssn-d1-api.gastonsoftwaresolutions234.workers.dev/api/v1/emails/send`
- **Auth:** `Authorization: Bearer ${QEMAIL_AUTH_TOKEN}`
- **Request:** `{ to, subject, html, from_name }`
- **Response:** `{ success, message_id, from, to }`
- **Limits:** 100 emails/day (free tier), 10 requests/minute

### Cloudflare KV
- **Audit Log Key Pattern:** `audit:${transaction_id}`
- **Index Key:** `audit:index` (rolling list of last 500 transaction IDs)
- **TTL:** 90 days (7,776,000 seconds)

---

## Error Handling

All services implement graceful degradation:

1. **Network errors** → Log to console, return fallback response
2. **Non-OK HTTP status** → Log response body, return error object
3. **Malformed JSON** → Catch parse errors, return safe default

The gateway never throws unhandled exceptions — every route returns a valid JSON response with appropriate HTTP status codes.

---

## Security Considerations

1. **Secrets Management:** All sensitive credentials are stored as Cloudflare secrets, never in code or environment variables
2. **CORS:** Configured to allow dashboard origin (`*` for development, lock down in production)
3. **Input Validation:** Email addresses, policy types, and required fields are validated before processing
4. **DPI Layer:** All user-provided text passes through Lobster Trap before reaching Gemini or email delivery
5. **Audit Trail:** Every transaction (including blocked attempts) is logged to KV with 90-day retention

---

## Deployment

### Local Development
```bash
npm run dev
```
- Dashboard: `http://localhost:3000`
- API: `http://localhost:3000/v1/*`

### Production
```bash
npm run build
npx wrangler deploy
```
- Live URL: `https://sovereign-guard-ai.gastonsoftwaresolutions234.workers.dev`

---

## Monitoring & Debugging

### Cloudflare Dashboard
- **Workers & Pages** → `sovereign-guard-ai` → **Logs**
- Real-time tail: `npx wrangler tail`

### KV Browser
```bash
npx wrangler kv key list --namespace-id=YOUR_KV_ID --prefix=audit:
npx wrangler kv key get audit:SGT-L8X9K2-A7B3C1 --namespace-id=YOUR_KV_ID
```

### Health Check
```bash
curl https://sovereign-guard-ai.gastonsoftwaresolutions234.workers.dev/v1/health
```

---

## Future Enhancements

- [ ] Rate limiting per sender_id
- [ ] Webhook callbacks for delivery status
- [ ] Multi-region KV replication
- [ ] Prometheus metrics export
- [ ] Dashboard authentication (Cloudflare Access)
- [ ] Batch notification endpoint
- [ ] Template library (pre-approved HTML layouts)
- [ ] A/B testing for email formats
