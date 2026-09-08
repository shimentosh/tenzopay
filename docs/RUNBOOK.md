# TenzoPay Runbook

Operational setup: providers, webhooks, testing, deployment.

---

## 1. Lithic setup

### Get a key

1. Sign up at <https://docs.lithic.com/docs/sign-up>.
2. Dashboard → **Developers → API Keys** → create a **Sandbox** key.
3. Put it in `.env` as `LITHIC_API_KEY`. It is used raw:
   `Authorization: <key>` — **no `Bearer` prefix**.

Verify:

```bash
curl -s https://sandbox.lithic.com/v1/status -H "Authorization: $LITHIC_API_KEY"
# {"message":"OK"}
```

### Expose your local API

Both webhooks and ASA need a public HTTPS URL:

```bash
ngrok http 4000
# https://<id>.ngrok.app  ->  http://localhost:4000
```

### Event subscription (transactions, KYC, card updates)

```bash
curl -X POST https://sandbox.lithic.com/v1/event_subscriptions \
  -H "Authorization: $LITHIC_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "url": "https://<id>.ngrok.app/api/webhooks/lithic",
    "description": "TenzoPay",
    "event_types": [
      "card_transaction.updated",
      "card.updated",
      "account_holder.verification",
      "account_holder.updated"
    ]
  }'
```

Then fetch the signing secret and set `LITHIC_WEBHOOK_SECRET`:

```bash
curl -s https://sandbox.lithic.com/v1/event_subscriptions/<token>/secret \
  -H "Authorization: $LITHIC_API_KEY"
# {"secret":"whsec_..."}
```

Signature scheme (Standard Webhooks): HMAC-SHA256 over
`{webhook-id}.{webhook-timestamp}.{raw body}`, keyed with the base64 material
after `whsec_`, compared in constant time with a 5-minute replay window.

### Auth Stream Access — the important one

ASA is what makes cards spend against the shared balance.

```bash
# 1. Enroll the responder endpoint
curl -X POST https://sandbox.lithic.com/v1/responder_endpoints \
  -H "Authorization: $LITHIC_API_KEY" -H "Content-Type: application/json" \
  -d '{"type":"AUTH_STREAM_ACCESS","url":"https://<id>.ngrok.app/api/webhooks/lithic/asa"}'

# 2. Retrieve the HMAC secret -> LITHIC_ASA_SECRET
curl -s https://sandbox.lithic.com/v1/auth_stream/secret -H "Authorization: $LITHIC_API_KEY"

# 3. Confirm enrollment
curl -s "https://sandbox.lithic.com/v1/responder_endpoints?type=AUTH_STREAM_ACCESS" \
  -H "Authorization: $LITHIC_API_KEY"
# {"enrolled": true, "url": "..."}
```

**Budget: respond within 3 s.** Lithic declines at 6 s. TenzoPay's decision
path is a handful of indexed queries plus one SERIALIZABLE transaction, and
logs a warning above 2 s.

> Rotate `LITHIC_ASA_SECRET` and the API key if they have ever been pasted into
> a chat, a ticket, or a screenshot.

### Simulate a transaction

```bash
# Authorize (the PAN is returned by card creation in sandbox only)
curl -X POST https://sandbox.lithic.com/v1/simulate/authorize \
  -H "Authorization: $LITHIC_API_KEY" -H "Content-Type: application/json" \
  -d '{"pan":"<sandbox pan>","amount":1234,"descriptor":"COFFEE SHOP","mcc":"5812"}'
# -> {"token":"<transaction_token>"}

# Clear it (settles, converting the hold into a settlement)
curl -X POST https://sandbox.lithic.com/v1/simulate/clearing \
  -H "Authorization: $LITHIC_API_KEY" -H "Content-Type: application/json" \
  -d '{"token":"<transaction_token>","amount":1234}'

# Or void it (releases the hold back to available)
curl -X POST https://sandbox.lithic.com/v1/simulate/void \
  -H "Authorization: $LITHIC_API_KEY" -H "Content-Type: application/json" \
  -d '{"token":"<transaction_token>","amount":1234}'
```

### Rate limits

Sandbox: **15 RPS read / 1 RPS write** (cards 15/2). Production: 30/5.
429 returns `retry-after: 1`. The client backs off exponentially with jitter and
honours the header — do not remove it.

---

## 2. Alchemy setup

Only needed when `BLOCKCHAIN_PROVIDER=alchemy`. Demo mode needs nothing.

1. Create an app at <https://dashboard.alchemy.com> on **Ethereum Sepolia** (or
   Mainnet).
2. `ALCHEMY_API_KEY` = the app's key.
3. Notify → create an **Address Activity** webhook pointing at
   `https://<id>.ngrok.app/api/webhooks/alchemy`.
4. `ALCHEMY_WEBHOOK_SIGNING_KEY` = that webhook's signing key.
5. `ALCHEMY_AUTH_TOKEN` = the dashboard **AUTH TOKEN** (used to register
   addresses).
6. `ALCHEMY_WEBHOOK_ID` = the webhook's id.

Signature: HMAC-SHA256 of the **raw body**, hex, in `x-alchemy-signature`.
Verify against the raw buffer — re-serializing the parsed JSON changes byte
order and silently fails.

### USDT contract

| Network | Address | Decimals |
|---|---|---|
| Ethereum mainnet | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 |
| Sepolia | none canonical — deploy a mock ERC-20 | 6 |

Set via `USDT_CONTRACT_ADDRESS_MAINNET` / `USDT_CONTRACT_ADDRESS_SEPOLIA`.

### Detection has two paths

1. **Address Activity webhook** — low latency, primary.
2. **`alchemy_getAssetTransfers` sweep** every 5 minutes — the backstop.

Both funnel into the same idempotent `recordTransfer()`. A dropped webhook is
therefore a latency problem, not a lost deposit.

**No TRON.** Alchemy offers TRON RPC, but Address Activity webhooks are
documented for EVM chains and Solana. Adding TRON without webhook coverage
would mean pretending to monitor a chain we cannot watch.

---

## 3. Testing the flows

### Demo deposit (no external service)

Sign in → **Deposit** → *Simulate deposit*. The deposit runs the real pipeline:
`DETECTED → CONFIRMING → CONFIRMED`, then posts a ledger credit. The mock chain
advances one block per second, so 12 confirmations take ~12 s.

### Sepolia deposit

Set `DEPOSIT_MODE=sandbox`, `BLOCKCHAIN_PROVIDER=alchemy`,
`DEPOSIT_NETWORK=ETHEREUM_SEPOLIA`, and a mock ERC-20 in
`USDT_CONTRACT_ADDRESS_SEPOLIA`. Send test tokens to the address on the deposit
screen.

### ASA decisioning

With ASA enrolled, `simulate/authorize` triggers a real call to your endpoint.
Watch the API log:

```
ASA decision ... APPROVED / INSUFFICIENT_FUNDS / VELOCITY_EXCEEDED / CARD_PAUSED
```

Every decision is persisted to `authorization_events` with its latency.

### Ledger integrity

Runs every 10 minutes and on the admin health page. To check manually:

```sql
SELECT COUNT(*) AS unbalanced FROM (
  SELECT le."transactionId"
  FROM ledger_entries le
  GROUP BY le."transactionId"
  HAVING COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN le.amount
                           ELSE -le.amount END), 0) <> 0
) x;
-- must always be 0
```

---

## 4. Operations

### Scheduled jobs

| Job | Interval | Purpose |
|---|---|---|
| Confirmation walker | 30 s | advance `CONFIRMING → CONFIRMED`, post credits |
| Deposit reconciliation | 5 min | chain sweep catching missed webhooks |
| Webhook retry | 1 min | retry transient processing failures |
| Ledger integrity | 10 min | assert zero-sum and non-negative balances |
| Session pruning | 1 h | drop expired and long-revoked sessions |

All are idempotent and safe to re-run. They run in-process, which is correct for
one instance; multiple replicas would execute each job N times — harmless given
idempotency, but wasteful. Move to a queue with leader election before scaling
out.

### Common incidents

**Deposit not credited.** Check `deposits.status`. If `CONFIRMING`, it is still
below the required depth. If `DETECTED` and stale, the confirmation walker may
be stuck — use the console's *Retry* on the deposit, which re-reads the chain.
It cannot double-credit.

**Webhooks in DEAD_LETTER.** Five failed attempts. Inspect the error in the
console, fix the cause, then *Replay* — processing is idempotent.

**ASA declining everything.** Check the API is reachable from Lithic, the
responder endpoint is enrolled, and `LITHIC_ASA_SECRET` matches. ASA fails
closed by design, so a misconfiguration declines rather than over-approves.

**Ledger integrity failure.** Stop writes and investigate immediately. Query
the unbalanced transaction ids from the health endpoint. Entries are immutable,
so the fix is a compensating adjustment, never an edit.

---

## 5. Deployment

The API needs a persistent process (webhooks and ASA are inbound HTTP; ASA is
latency-sensitive). Serverless is a poor fit for the ASA endpoint — a cold start
inside a 3-second budget will decline real transactions.

```bash
npm run build          # shared -> api -> web -> admin
npm run db:migrate     # prisma migrate deploy in CI/CD
node apps/api/dist/main.js
```

Set for production:

```bash
APP_ENV=production
NODE_ENV=production
COOKIE_SECURE=true
LITHIC_ENVIRONMENT=production
CORS_ORIGINS=https://app.yourdomain.com,https://console.yourdomain.com
```

If the front-ends sit on a different registrable domain from the API, cookies
need `SameSite=None; Secure` — otherwise place them behind one domain and proxy
`/api`, which is preferable anyway.

Put the admin console on an internal network or behind SSO. It is a separate
app precisely so it can be deployed separately.

---

## 6. Production readiness checklist

**Blocking — the product cannot handle real money without these**

- [ ] Custody provider integrated (Fireblocks / Turnkey / BitGo)
- [ ] Crypto→fiat off-ramp with a real quoted FX rate
- [ ] Program manager / sponsor bank relationship
- [ ] Money transmitter or MSB licensing, or operation under a sponsor's
- [ ] VASP registration where required
- [ ] AML programme: sanctions screening, PEP, monitoring, SAR filing
- [ ] Settlement prefunding and treasury operations

**Engineering**

- [ ] Both API keys and both webhook secrets rotated and stored in a secrets
      manager
- [ ] `ENCRYPTION_KEY` rotation procedure documented
- [ ] Jobs moved to a queue with leader election
- [ ] Error tracking and log aggregation with redaction verified end to end
- [ ] Alerting on: ledger integrity failure, DEAD_LETTER growth, ASA latency
      p99, provider health
- [ ] Database backups with a tested restore
- [ ] Load test of the ASA endpoint against the 3 s budget
- [ ] Rate limits tuned per endpoint
- [ ] Real email delivery for verification and password reset
- [ ] Penetration test

**Product**

- [ ] Terms, privacy policy, cardholder agreement reviewed by counsel
- [ ] Dispute and chargeback handling (Reg E where applicable)
- [ ] Statements
- [ ] Support runbooks for frozen accounts and stuck deposits
