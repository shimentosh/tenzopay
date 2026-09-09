# Security review — crypto deposits and the money path

Reviewed 9 September 2026 against the code on `shimanto`. Scope: the paths that
move value — crypto deposit acceptance, the ledger, authentication and
authorization, webhook trust, and secret handling.

This is a working document. Each finding says what is wrong, why it matters,
and whether it is fixed.

---

## What is already sound

Worth writing down, because these are the parts that usually go wrong and here
they do not:

- **Webhook signatures are verified against the raw bytes.** `main.ts` captures
  `rawBody` before parsing; re-serializing would change key order and silently
  break verification. Comparison is `timingSafeEqual`, never `===`.
- **Lithic verification follows Standard Webhooks** — `{id}.{timestamp}.{body}`,
  a 300-second replay window, and multiple signatures accepted during rotation.
- **Deposits carry two independent idempotency locks**: `UNIQUE(network,
  txHash, logIndex)` on the deposit row, and `UNIQUE(idempotencyKey)` on the
  ledger transaction. A bug in one layer still cannot double-credit.
- **Only the configured token is credited.** Any other contract landing on a
  deposit address is recorded for forensics and ignored.
- **Amounts are read from `rawContract.value` as hex → BigInt**, with decimals
  taken from the transfer itself. The float `value` field is never touched.
- **Confirmations are read from the chain**, not from the webhook payload, and
  a vanished transaction is marked `ORPHANED` after a grace period.
- **Deposit addresses derive from a watch-only xpub.** No private key exists in
  this codebase.
- **Every user-facing query is scoped by `userId`** — no IDOR was found in
  cards or transactions.
- **Every money-moving endpoint sits behind `@RequireKyc()`**, enforced in a
  guard rather than per-handler.
- **Admin uses `@Roles` plus a second in-service check**, on its own origin and
  its own cookie.
- **Config validation fails at boot**, and production refuses `DEPOSIT_MODE=demo`
  and `CARD_PROVIDER=mock`.

---

## Findings

### 1. Placeholder secrets booted production — FIXED

`.env.example` ships `JWT_ACCESS_SECRET=replace-me-with-a-long-random-string`
(36 characters) and `ENCRYPTION_KEY=0000…` (64 valid hex characters). Both
satisfied the length and format rules, so copying the example file into
production would boot an API **signing tokens with a key published in a public
repository** — forge a token for any user, including staff.

Fixed in `config/configuration.ts`: under `APP_ENV=production` the config now
rejects placeholder patterns, keys with fewer than 12 distinct characters, an
all-zero encryption key, and reuse of one secret for both access and refresh
tokens. Covered by `test/config-secrets.spec.ts`.

### 2. Rate limiting collapsed behind a proxy — FIXED

Express was never told about reverse proxies, so `req.ip` resolved to the load
balancer. Consequences: every user shared one throttle bucket, so a single
attacker could exhaust the limit for everyone; per-IP login throttling stopped
working; and the IP written to `audit_logs` — the record you would rely on in a
dispute — was wrong.

Fixed with an explicit `TRUST_PROXY_HOPS` (default `0`). The hop count is
deliberate: `trust proxy: true` lets a client forge `X-Forwarded-For` and
bypass throttling entirely.

### 3. Webhook verification was optional outside production — FIXED

Both handlers only *required* a secret when `APP_ENV === 'production'`. A
sandbox or staging deployment pointed at real webhooks with the secret unset
would have accepted **forged deposit credits and forged authorization
decisions**.

Fixed: all three handlers now fail closed unless `APP_ENV === 'development'`.

### 4. Derivation index could hand two users one address — FIXED

`deposit-address.service.ts` allocated the next BIP-32 index with `COUNT()`.
The unique constraint stopped concurrent collisions, but deleting any address
row would make the next allocation **reuse that index** — a second user
receives an address the first may still be sending to, and their funds credit
the wrong account.

Fixed: the index is now `MAX(derivationIndex) + 1`, which only moves forward.
The unique constraint remains the backstop for races.

---

## Outstanding

### 5. No account lockout — HIGH

Login is throttled at 10/minute per IP, but nothing counts failures **per
account**. An attacker rotating IPs can grind passwords indefinitely, and
neither the account holder nor staff receive any signal.

Needs a schema change: `failedLoginAttempts` and `lockedUntil` on `User`, an
exponential backoff, a reset on success, and a notification on lockout. Deferred
because it needs a migration, which should be run deliberately.

### 6. No multi-factor authentication — HIGH

A password alone protects a balance and the card-reveal flow. TOTP at sign-in,
and a step-up challenge before revealing card details, is the minimum a fintech
is expected to carry.

### 7. A re-org after crediting is never reversed — MEDIUM

`advanceConfirmations` returns early once a deposit is `CONFIRMED`, so a
transaction re-orged out *after* crediting leaves the balance intact. Twelve
confirmations makes this unlikely on Ethereum mainnet, not impossible.

The fix fits the existing architecture: keep watching credited deposits for a
further N blocks, and if the transaction disappears, post a **compensating
ledger entry**. Never edit the original — entries are immutable.

### 8. Dependency vulnerabilities — MEDIUM

`npm audit --omit=dev` reports 9 (8 high, 1 moderate): postcss reached through
`next@15.1.6`. The advisories are source-map and CSS-stringify issues, so the
practical exposure through this app is low, but the remediation is `next@16`,
which is a breaking upgrade and should be planned rather than forced.

### 9. No sanctions screening or transaction monitoring — KNOWN

Already stated in CLAUDE.md. Accepting real crypto also needs screening of
deposit *source* addresses and a view on travel-rule obligations.

### 10. Deposit addresses never rotate — LOW

One static address per user per network, forever. Reuse weakens privacy and
makes address-poisoning easier to attempt.

---

## Order of work

1. ~~Placeholder secrets~~, ~~proxy trust~~, ~~webhook gating~~, ~~derivation
   index~~ — done, they were the config-level ones that turn into "the account
   was drained".
2. Account lockout (5) — small, needs a migration.
3. Re-org compensation (7) — touches the ledger, so it needs tests first.
4. MFA (6) — a feature, plan it properly.
5. `next@16` (8) — schedule with the breaking-change work.
