# TenzoPay — Architecture & Research Report

**Status:** Phase 0 (research) complete. Findings below are verified against official
documentation and, where marked ✅ VERIFIED, against live calls to the Lithic sandbox.

---

## 0. The headline finding (read this first)

> **USDT deposited into a TenzoPay blockchain wallet does NOT automatically become
> spendable on a Lithic card. There is no such link, and this build does not pretend
> otherwise.**

Three separate facts establish this:

1. **Lithic does have native stablecoin funding — but not for us, and not USDT.**
   Lithic supports stablecoin pay-ins to a *Financial Account* via a `blockchain_addresses`
   map, with lifecycle events `STABLECOIN_RECEIVED → STABLECOIN_REVIEWED → STABLECOIN_SETTLED`.
   Constraints:
   - Chains: **Ethereum, Base, Solana** only (Sepolia / Base Sepolia / Solana Devnet in sandbox).
   - Token: documented and faucet-tested as **USDC**. USDT is not the documented pay-in asset.
   - It is a **pilot, enabled per program** during commercial onboarding.
2. **It is not enabled on the supplied sandbox key.** ✅ VERIFIED:
   `GET /v1/financial_accounts` → `{"data":[],"has_more":false}`;
   `GET /v1/balances` → `{"data":[],"has_more":false}`;
   `GET /v1/card_programs` → `401 "This endpoint is only available for enterprise customers."`
   This key is a **processor-style issuing sandbox**: cards + auth + transactions, no Lithic ledger.
3. **Lithic does not settle.** Lithic's own position: *"Lithic doesn't handle settlement
   directly."* Card spend is settled in fiat by a program manager / sponsor bank against
   prefunded balances.

### What is therefore missing to move real money

| Missing layer | Why it is needed | Example providers |
|---|---|---|
| **Custody / key management** | Hold user USDT without TenzoPay storing private keys | Fireblocks, BitGo, Turnkey, Anchorage |
| **Crypto → fiat off-ramp (VASP)** | Convert USDT to USD to prefund card settlement | Bridge, Zero Hash, Circle |
| **Program manager / BIN sponsor** | Lithic requires a sponsor bank; issues the BIN, holds settlement funds | via Lithic commercial onboarding |
| **Prefunding / settlement ops** | Cash must sit at the sponsor before cards can spend | treasury function |
| **Licensing** | Custody + transmission of customer value | MTL / MSB (US), or the sponsor's licence |
| **Production KYC/AML** | Sanctions, PEP, ongoing monitoring, SAR filing | Lithic KYC + a dedicated AML vendor |

**Conclusion:** TenzoPay as built is a **complete, correct application layer** — real Lithic
card issuing, real authorization control, a real double-entry ledger, real Alchemy chain
monitoring — with the **money-transmission layer explicitly stubbed and labelled**. It is
production-*architecture*, not production-*licensed*.

---

## 1. Executive architecture summary

TenzoPay is split into two planes:

- **Money plane (source of truth):** TenzoPay's own PostgreSQL **double-entry ledger**.
  Every cent of customer value is a pair of immutable `ledger_entries`. Balance is always
  *derived* (`SUM(credits) - SUM(debits)`), never a mutable column.
- **Card plane (execution):** **Lithic** issues virtual cards and processes authorizations.

The two planes are joined by **Auth Stream Access (ASA)**. On every authorization Lithic
POSTs to TenzoPay; TenzoPay checks the ledger, places a **hold**, and answers `APPROVED`
or `INSUFFICIENT_FUNDS` within ~3 s. This is what makes *"one balance, many cards"*
literally true rather than cosmetic.

```
 USDT deposit                 TenzoPay Ledger                    Lithic
 ------------                 ---------------                    ------
 Alchemy webhook --credit-->  [ available ]  <--ASA decision--   authorization
                              [   held    ]  <--webhook-------   clearing / void
                              [  settled  ]
```

**Why ASA and not "sync the balance into a Lithic spend limit":** a spend limit is a
per-card ceiling, not a shared pool. With five cards on one 10,000 USDT balance, limits
alone would let the user spend 5× the balance. ASA evaluates the *shared* pool per
authorization.

Defence in depth — three independent enforcement layers:

| Layer | Enforced by | Purpose |
|---|---|---|
| Card `spend_limit` + `spend_limit_duration` | Lithic | hard per-card ceiling ✅ VERIFIED |
| Auth Rules V2 `VELOCITY_LIMIT` | Lithic | daily / monthly velocity ✅ VERIFIED |
| **ASA** | TenzoPay | shared-balance solvency + holds ✅ secret issued in sandbox |

---

## 2. Exact user journey

1. **Sign up** — email + password (argon2id). Email verification token issued.
2. **KYC** — `POST /v1/account_holders` with `workflow: KYC_BASIC`.
   ✅ VERIFIED: sandbox returns `status: "ACCEPTED"` plus an `account_token`.
   Sandbox can be driven to other outcomes via `simulate_enrollment_review`.
3. **Deposit** — TenzoPay derives a per-user Ethereum address (watch-only, from an
   account-level `xpub`), registers it with Alchemy Address Activity, and shows the
   address + QR + network warning + minimum.
4. **Detection** — Alchemy webhook fires → `DETECTED` → confirmations tracked →
   `CONFIRMED` at N blocks → ledger credit. Duplicate-proof by
   `UNIQUE(network, tx_hash, log_index)`.
5. **Create card** — name → limits → review → `POST /v1/cards` (`type: VIRTUAL`) with an
   `Idempotency-Key`, then `POST /v2/auth_rules` (VELOCITY_LIMIT) and **promote**.
6. **Spend** — merchant → Lithic → ASA → ledger hold → approve/decline.
7. **Settle** — `card_transaction.updated` webhook → hold released, settlement debited.
8. **Freeze** — `PATCH /v1/cards/{token}` `{state: PAUSED}`.
   ✅ VERIFIED: a simulated auth on a paused card returns `result: "CARD_PAUSED"`.

## 3. Exact admin journey

Login (separate `admin_users` table, RBAC) → dashboard KPIs → user search → user 360
(KYC, balance, deposits, cards, transactions) → deposit reconciliation → card oversight →
**ledger adjustment with mandatory reason + double-entry posting + audit log** (never a
balance overwrite) → webhook dead-letter replay → audit trail → health page.

RBAC roles: `SUPER_ADMIN`, `ADMIN`, `FINANCE`, `RISK`, `SUPPORT`.
`SUPPORT` is explicitly denied ledger adjustments and PAN access.

## 4. Database ERD (summary)

```
User --1:1-- AccountHolder --1:1-- Wallet --1:N-- LedgerAccount --1:N-- LedgerEntry
  |                                   |                                      ^
  |                                   +--1:N-- DepositAddress --1:N-- Deposit |
  |                                                          (BlockchainTransaction)
  +--1:N-- Card --1:N-- CardRule
  |           +--1:N-- CardTransaction --1:N-- AuthorizationEvent
  +--1:N-- KycRecord, Notification, Session
  +--N:1-- (admin) AuditLog, AdminAction

WebhookEvent, Fee, IdempotencyKey, LedgerTransaction stand alone.
```

Every entry belongs to a `LedgerTransaction` whose entries must sum to zero.

`LedgerAccount` kinds per user: `USER_AVAILABLE`, `USER_HELD`; system accounts:
`SYSTEM_DEPOSIT_CLEARING`, `SYSTEM_CARD_SETTLEMENT`, `SYSTEM_FEE_REVENUE`,
`SYSTEM_ADJUSTMENT`.

## 5. Money flow

```
Deposit 1,000 USDT confirmed
  DR  system:deposit_clearing   100000        (minor units)
  CR  user:available            100000

Authorization 100 USDT (ASA)
  DR  user:available             10000
  CR  user:held                  10000

Clearing 100 USDT
  DR  user:held                  10000
  CR  system:card_settlement     10000

Void / expiry instead of clearing
  DR  user:held                  10000
  CR  user:available             10000
```

All amounts are **integer minor units**. No floats anywhere in the money path.

## 6. Card flow

`CREATE → (Lithic OPEN) → ACTIVE <-> FROZEN(PAUSED) → CLOSED(terminal)`

TenzoPay state maps 1:1 onto Lithic's real enum — no invented states.
`ACTIVE→OPEN`, `FROZEN→PAUSED`, `CLOSED→CLOSED`. `CLOSED` is irreversible.

## 7. Deposit flow

`PENDING → DETECTED → CONFIRMING → CONFIRMED` (or `FAILED` / `ORPHANED` on reorg).
Credit is posted **once**, at `CONFIRMED`, inside a DB transaction guarded by a unique
constraint on `(network, tx_hash, log_index)`.

## 8. Lithic API integration table

| Purpose | Method | Endpoint | Status |
|---|---|---|---|
| Health | GET | `/v1/status` | ✅ verified 200 |
| Create account holder (KYC) | POST | `/v1/account_holders` | ✅ verified ACCEPTED |
| Simulate KYC review | POST | `/v1/account_holders/{t}/simulate_enrollment_review` | documented |
| Create virtual card | POST | `/v1/cards` | ✅ verified |
| List / get card | GET | `/v1/cards`, `/v1/cards/{t}` | ✅ verified |
| Freeze / unfreeze / close | PATCH | `/v1/cards/{t}` | ✅ verified |
| Card spend usage | GET | `/v1/cards/{t}/spend_limits` | ✅ verified |
| Secure PAN reveal | POST | `/v1/cards/{t}/embed` → `GET /v1/embed` | documented (iframe) |
| Create auth rule | POST | `/v2/auth_rules` | ✅ verified (created SHADOWING) |
| **Promote rule** | POST | `/v2/auth_rules/{t}/promote` | ✅ verified → ACTIVE |
| Update / delete rule | PATCH / DELETE | `/v2/auth_rules/{t}` | documented |
| List transactions | GET | `/v1/transactions` | ✅ verified |
| Simulate authorization | POST | `/v1/simulate/authorize` | ✅ verified 201 |
| Simulate clearing / void | POST | `/v1/simulate/clearing`, `/v1/simulate/void` | documented |
| ASA secret | GET | `/v1/auth_stream/secret` | ✅ verified (secret issued) |
| Enroll ASA responder | POST | `/v1/responder_endpoints` | ✅ verified (`enrolled:false`) |
| Event subscriptions | GET / POST | `/v1/event_subscriptions` | ✅ verified |

**Not available on this key:** `/v1/financial_accounts` (empty), `/v1/balances` (empty),
`/v1/book_transfers`, `/v1/card_programs` (401 enterprise-only).

- Auth header: `Authorization: <api-key>` (raw, **no** `Bearer` prefix).
- Idempotency: `Idempotency-Key` header on POSTs.
- Rate limits: sandbox 15 RPS read / 1 RPS write (cards 15/2); production 30/5.
  429 returns `retry-after: 1`; the client uses bounded exponential backoff + jitter.
- Webhook signature: Standard Webhooks style — `webhook-id`, `webhook-timestamp`,
  `webhook-signature`, HMAC-SHA256 over `{id}.{timestamp}.{body}` using the base64 material
  after the `whsec_` prefix.

## 9. Alchemy API integration table

| Purpose | Method | Notes |
|---|---|---|
| ERC-20 balance / metadata | `alchemy_getTokenBalances`, `alchemy_getTokenMetadata` | JSON-RPC |
| Historical transfers (reconciliation) | `alchemy_getAssetTransfers` | `category:["erc20"]`, `contractAddresses`, `toAddress`, `pageKey` |
| Head block | `eth_blockNumber` | confirmation depth |
| Receipt / reorg check | `eth_getTransactionReceipt` | |
| Live detection | **Address Activity webhook** | HMAC-SHA256, header `x-alchemy-signature`, hex digest over the raw body |
| Register addresses | Notify API, header `X-Alchemy-Token` | add/remove watched addresses |

**Chain decision — Ethereum (mainnet config) / Sepolia (dev).**
Alchemy now offers TRON *RPC*, but Address Activity webhooks are documented for EVM chains
+ Solana. Since roughly half of circulating USDT lives on TRON this matters commercially,
but TRON is **deliberately excluded from MVP** rather than faked.

USDT mainnet contract `0xdAC17F958D2ee523a2206206994597C13D831ec7` (**6 decimals**),
supplied via env, never hardcoded. Sepolia has no canonical USDT, so the testnet contract
is configurable and defaults to a mock ERC-20.

## 10. Security model

Argon2id passwords · httpOnly/SameSite/Secure cookies · JWT access (15 m) + rotating
refresh (30 d) with reuse detection · RBAC guards · Zod validation on every boundary ·
Prisma parameterised queries · per-IP and per-user rate limiting · CSRF via SameSite +
double-submit · Helmet + strict CORS allowlist · AES-256-GCM for secrets at rest ·
**PAN/CVV never stored, never logged, never proxied — revealed only through Lithic's embed
iframe** · a log redaction filter for `pan|cvv|pin|password|token|secret|authorization` ·
webhook HMAC verification with `timingSafeEqual` plus timestamp-skew rejection ·
append-only audit log.

## 11. Failure / retry & reconciliation

- **Webhooks:** verify → persist raw → return 200 immediately → process asynchronously.
  Idempotent on `(provider, event_id)`. Failures land in a dead-letter state with bounded retry.
- **ASA:** fail-safe. Any internal error → `INSUFFICIENT_FUNDS` (decline), never fail-open.
  Duplicate ASA requests are deduped by `event_token`.
- **Reconciliation jobs:** (a) `getAssetTransfers` sweep catches missed webhooks;
  (b) a confirmation walker advances `CONFIRMING → CONFIRMED`; (c) Lithic transaction
  backfill; (d) stale-hold expiry; (e) an **invariant check** asserting every
  `LedgerTransaction` sums to zero and no user balance is negative.

## 12. MVP vs Phase 2

**MVP:** auth + RBAC, KYC via Lithic, double-entry ledger, USDT deposits on Ethereum
(demo/sandbox modes), virtual cards, freeze/unfreeze/close, velocity rules, ASA
decisioning, transaction sync, dashboards, admin panel, webhooks, tests.

**Phase 2:** custody provider, USDT→USD off-ramp, TRON support once webhook coverage is
confirmed, physical cards, Apple/Google Pay push provisioning, 3DS decisioning, disputes,
statements, multi-currency FX, a fee engine, SOC 2 controls.

## 13. Deposit address architecture

Chosen: **(A) one deterministic watch-only address per user**, derived from a BIP-32
account `xpub` at `m/44'/60'/0'/0/{index}`.

- The extended **public** key alone is enough to derive addresses. **No private key
  material ever touches TenzoPay's database or servers.**
- Sweeping/withdrawal requires signing, and signing requires a custody provider
  (Fireblocks / Turnkey / BitGo). That is **not implemented** and is listed as a missing
  dependency — the interface exists, the capability does not.
- `DEPOSIT_MODE` gates behaviour: `demo` (simulated credits, badged in the UI),
  `sandbox` (real Sepolia monitoring), `production` (refuses to start without custody config).

## 14. Risks

| Risk | Mitigation |
|---|---|
| No off-ramp → card spend cannot really settle | Documented; demo mode clearly labelled |
| ASA is in the critical path of every auth | Fail-safe decline, 3 s budget, health checks |
| Chain reorg reverses a credited deposit | Confirmation depth + `ORPHANED` state + reversal entries |
| Duplicate deposit credit | `UNIQUE(network, tx_hash, log_index)` + idempotent posting |
| Lithic rate limits (1 RPS sandbox writes) | Backoff, queueing, idempotency keys |
| Sandbox PAN exposure | Never stored; embed iframe only |
| Ledger drift | Zero-sum invariant job + admin reconciliation view |

## 15. Regulatory / compliance assumptions

This codebase assumes, and does **not** provide:
a sponsor bank / program manager relationship; money transmitter or MSB licensing;
VASP registration for crypto handling; a full AML programme (sanctions screening,
transaction monitoring, SAR filing); PCI DSS validation (avoided by never touching PAN
server-side); Reg E / dispute handling; state-by-state licensing.

**TenzoPay must not process real customer funds until those exist.**
