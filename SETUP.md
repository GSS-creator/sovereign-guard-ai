# SovereignGuard AI — Backend Setup Guide

## Prerequisites
- Node.js 18+ installed
- Cloudflare account (ID: `913f9e13350f335dd1e2bac9a8317a38`)
- Wrangler CLI (already installed via npm)

## Step 1: Update wrangler.jsonc

Replace the contents of `wrangler.jsonc` with:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "sovereign-guard-ai",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server.ts",
  "account_id": "913f9e13350f335dd1e2bac9a8317a38",

  "vars": {
    "LOBSTER_TRAP_URL": "https://your-huggingface-space.hf.space"
  },

  "kv_namespaces": [
    {
      "binding": "SOVEREIGN_GUARD_KV",
      "id": "REPLACE_AFTER_STEP_2"
    }
  ]
}
```

## Step 2: Create KV Namespace

```bash
npx wrangler kv namespace create SOVEREIGN_GUARD_KV --env production
```

Copy the returned `id` and paste it into `wrangler.jsonc` under `kv_namespaces[0].id`.

## Step 3: Set Production Secrets

```bash
# Set your Gemini API key
npx wrangler secret put GEMINI_API_KEY

# Set the QSSN mail token
npx wrangler secret put QEMAIL_AUTH_TOKEN
# Paste: qssn_live_351304635ba0107d5041a7ebe3321253e0ce0f5cbe55ab21a7cce1198975c188
```

## Step 4: Update .dev.vars for Local Development

Edit `.dev.vars` and replace `your_gemini_api_key_here` with your actual Gemini API key.

The QSSN token is already filled in.

## Step 5: Test Locally

```bash
npm run dev
```

This starts:
- The React dashboard at `http://localhost:3000`
- The API gateway at `http://localhost:3000/v1/*`

Test the health endpoint:
```bash
curl http://localhost:3000/v1/health
```

## Step 6: Deploy to Cloudflare

```bash
npm run build
npx wrangler deploy
```

Your worker will be live at:
```
https://sovereign-guard-ai.gastonsoftwaresolutions234.workers.dev
```

## API Endpoints

### Health Check
```bash
GET /v1/health
```

### Send Secure Notification
```bash
POST /v1/send-secure-notification
Content-Type: application/json

{
  "recipient_email": "user@example.com",
  "sender_id": "security@gss-tec.com",
  "policy_type": "soc2",
  "raw_prompt_input": "Your account was accessed from a new device.",
  "template_context": {
    "subject": "Security Alert",
    "client_name": "John Doe"
  }
}
```

### Audit Logs
```bash
GET /v1/audit-logs?limit=50
```

## Architecture

```
Request → Cloudflare Worker
  ├─ /v1/* → API Gateway (src/worker/gateway.ts)
  │   ├─ Validate request
  │   ├─ DPI via Lobster Trap (Hugging Face Spaces)
  │   ├─ Format HTML via Gemini 2.0 Flash
  │   ├─ Deliver via QSSN Mail Services
  │   └─ Write audit log to KV
  │
  └─ /* → TanStack SSR (React Dashboard)
```

## Troubleshooting

### SSL Certificate Error
If you see `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, try:
```bash
set NODE_TLS_REJECT_UNAUTHORIZED=0
npx wrangler login
```

### KV Namespace Not Found
Make sure the `id` in `wrangler.jsonc` matches the output from Step 2.

### QSSN Rate Limits
- Free tier: 100 emails/day
- Rate limit: 10 requests/minute

### Gemini API Errors
Check that your API key is valid and has quota remaining at:
https://aistudio.google.com/apikey
