# TenzoPay — Complete Build Plan

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md) (research + findings).
This file is the **execution plan**: what gets built, in what order, where each
file lives, and how to tell when a phase is genuinely done.

---

## 1. The one-paragraph summary

TenzoPay is a card-management platform where a user holds **one USDT balance**
and issues **many virtual cards** that all spend against it, each with its own
limits. The balance lives in TenzoPay's own **double-entry ledger** (Postgres).
Cards are issued and processed by **Lithic**. The two are joined by **Auth
Stream Access**: Lithic asks TenzoPay to approve every authorization in real
time, and TenzoPay answers from the ledger. Deposits are monitored on Ethereum
via **Alchemy**.

**What is real:** the ledger, the Lithic integration, the authorization
decisioning, the Alchemy monitoring, the whole application.
**What is not:** USDT cannot actually settle a card. That needs a custody
provider, an off-ramp, a sponsor bank and licensing — see ARCHITECTURE §0.
Demo funds are labelled everywhere and are blocked in production by config.

---

## 2. Repository layout

Three deployable apps, each on its own port, plus shared code.

```
J:\tenzopay
├── docs/
│   ├── ARCHITECTURE.md          research, findings, API tables, risks
│   ├── PLAN.md                  this file
│   └── RUNBOOK.md               setup, webhooks, testing, deployment
├── packages/
│   └── shared/                  Zod schemas, money maths, wire types
│       └── src/{money,schemas,types,index}.ts
├── apps/
│   ├── api/                     NestJS  — port 4000
│   │   ├── prisma/{schema.prisma,seed.ts}
│   │   └── src/
│   │       ├── config/          env validation (refuses unsafe combos)
│   │       ├── prisma/
│   │       ├── common/          errors, redaction, crypto, filters, pipes
│   │       ├── ledger/          ★ double-entry engine
│   │       ├── auth/            user + admin auth, guards, RBAC
│   │       ├── kyc/             Lithic account holders
│   │       ├── deposits/        addresses, detection, confirmation
│   │       ├── cards/           issuing, freeze, limits, reveal
│   │       ├── transactions/    unified feed
│   │       ├── webhooks/        Lithic + Alchemy + ★ ASA endpoint
│   │       ├── admin/           admin-only services
│   │       ├── jobs/            reconciliation, confirmations, invariants
│   │       └── providers/       CardProvider / BlockchainProvider + adapters
│   ├── web/                     Next.js — port 3000  (landing + user app)
│   └── admin/                   Next.js — port 7317  (admin console, separate)
├── docker-compose.yml           Postgres 16
├── .env.example
├── CLAUDE.md
└── README.md
```

### Ports

| App | Port | URL | Audience |
|---|---|---|---|
| API (NestJS) | **1222** | http://localhost:1222 | internal |
| Web (user) | **1111** | http://localhost:1111 | customers |
| **Admin** | **1333** | http://localhost:1333 | staff only |
| Postgres | 5432 | — | — |

**Why admin is a separate app, not a `/admin` route:** it gets its own origin,
its own cookie (`tenzo_admin_access`), and its own deployment. A bug or XSS in
the customer app cannot reach an admin session, and the admin console can be
firewalled to an internal network in production. This is the reason banks run
staff tooling on separate hosts.

---

## 3. Data model (18 tables)

| Group | Tables |
|---|---|
| Identity | `users`, `sessions`, `admin_users` |
| KYC | `account_holders`, `kyc_records` |
| **Ledger** | `wallets`, `ledger_accounts`, `ledger_transactions`, `ledger_entries` |
| Deposits | `deposit_addresses`, `deposits`, `blockchain_transactions` |
| Cards | `cards`, `card_rules` |
| Spending | `card_transactions`, `authorization_events` |
| Ops | `webhook_events`, `idempotency_keys`, `fees`, `audit_logs`, `admin_actions`, `notifications` |

Money is **BigInt minor units** throughout. There is no `balance` column
anywhere — balances are derived by summing immutable entries.

**The four constraints that prevent money bugs**

| Constraint | Prevents |
|---|---|
| `deposits UNIQUE(network, txHash, logIndex)` | crediting one chain transfer twice |
| `ledger_transactions UNIQUE(idempotencyKey)` | double-posting on retry |
| `webhook_events UNIQUE(provider, eventId)` | processing a redelivery twice |
| `cards UNIQUE(providerCardToken)` | duplicate cards from a retried create |

---

## 4. Build order

Each phase lists its **done-when** test. A phase is not finished until that
passes.

| # | Phase | Key output | Done when |
|---|---|---|---|
| 0 | Research | ARCHITECTURE.md | ✅ **complete** — endpoints verified live |
| 1 | Scaffold + config | monorepo, env validation, Docker | ✅ **complete** |
| 2 | Schema + ledger | `schema.prisma`, `LedgerService` | ✅ **complete** — invariants coded |
| 3 | Auth + RBAC | argon2, JWT rotation, guards | ✅ **complete** |
| 4 | Providers | Lithic/Alchemy/Mock adapters | ✅ **complete** |
| 5 | Migrations + seed | tables live, demo data | `npm run db:migrate` succeeds |
| 6 | KYC | account holder creation | sandbox returns `ACCEPTED` |
| 7 | Deposits | address, detect, confirm, credit | balance rises exactly once |
| 8 | Cards | create / freeze / limits / reveal | card appears in Lithic |
| 9 | **ASA** | real-time auth decisioning | over-balance auth is declined |
| 10 | Transactions | webhook sync, unified feed | settle releases the hold |
| 11 | Web UI | landing + dashboard | full user journey clickable |
| 12 | Admin UI | console on :1333 | adjustment posts double entries |
| 13 | Jobs | reconciliation, confirmations | missed webhook still credits |
| 14 | Tests | ledger, dedup, RBAC, webhooks | `npm test` green |
| 15 | Hardening + docs | RUNBOOK, checklist | fresh clone boots |

---

## 5. Feature specification

### 5.1 User app (:1111)

**Marketing** — `/`, `/features`, `/cards`, `/how-it-works`, `/security`,
`/pricing`, `/faq`.
Hero: *"One Balance. Every Card."* No exaggerated financial claims; the crypto
funding limitation is stated honestly on `/security`.

**Auth** — `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify`.

**Dashboard** — `/dashboard`
Available balance (large, dominant) · Deposit CTA · card grid with per-card
limit + usage · recent transactions · spending overview (today / 7d / 30d).

**Cards** — `/cards`, `/cards/[id]`
Card visual, status, today's and monthly usage, transactions, freeze/unfreeze,
limit editing, secure reveal (Lithic iframe). **Only controls Lithic actually
supports are shown.** No fake "ATM"/"contactless" toggles for a virtual card
that cannot do either.

**Deposit** — `/deposit`
Network selector, address, QR, copy, network warning, minimum, confirmation
progress, tx hash, history. Demo mode is badged in the panel, not hidden.

**Transactions** — `/transactions` with type/status/card/date filters and
detail drawer. Tables collapse to cards on mobile.

**Settings** — `/settings` — profile, KYC status, sessions, password.

### 5.2 Admin app (:1333)

`/` dashboard · `/users` · `/users/[id]` · `/kyc` · `/deposits` · `/cards` ·
`/transactions` · `/ledger` · `/webhooks` · `/audit` · `/health`

**KPIs:** total users, verified users, total deposits, pending deposits, card
volume, active cards, frozen cards, failed transactions, system alerts.

**The rule that shapes the admin panel:** there is no "set balance" control
anywhere. Correcting a balance means posting a signed adjustment with a
mandatory reason, which writes double entries plus an `admin_actions` row plus
an `audit_logs` row. `SUPPORT` cannot do it at all.

**RBAC**

| | SUPER_ADMIN | ADMIN | FINANCE | RISK | SUPPORT |
|---|---|---|---|---|---|
| View users / cards | ✔ | ✔ | ✔ | ✔ | ✔ |
| Freeze user / card | ✔ | ✔ | | ✔ | |
| Ledger adjustment | ✔ | | ✔ | | |
| Retry deposit recon | ✔ | ✔ | ✔ | | |
| Replay webhook | ✔ | ✔ | | | |
| Manage admins | ✔ | | | | |

---

## 6. The three enforcement layers (why the balance is real)

A spend limit is a *per-card ceiling*. Five cards each limited to $2,000 on a
$10,000 balance could spend $10,000 — but five cards limited to $10,000 each
could spend $50,000. Limits alone cannot express a **shared pool**. So:

| Layer | Enforced by | Scope |
|---|---|---|
| Card `spend_limit` | Lithic | one card, hard ceiling |
| Auth Rules V2 `VELOCITY_LIMIT` | Lithic | one card, per day/month |
| **ASA** | **TenzoPay ledger** | **shared balance across all cards** |

**ASA request path** (budget: 3 s, hard limit 6 s):
verify HMAC → dedupe on `event_token` → resolve card → check status → check
per-transaction limit → `placeHold()` at SERIALIZABLE → respond.

**Fail-safe:** any error, timeout or unknown card returns a decline, never an
approval. An issuer that fails open is an issuer that gets drained.

---

## 7. Deposit lifecycle

```
PENDING → DETECTED → CONFIRMING → CONFIRMED   (credit posted exactly here)
                            ↘ ORPHANED (re-org)   ↘ FAILED
```

Detection is **backend-only**, two independent paths so one failure is not
fatal:
1. **Alchemy Address Activity webhook** — low latency.
2. **`alchemy_getAssetTransfers` sweep** every 2 min — catches anything missed.

Both funnel into the same idempotent `recordTransfer()`, guarded by
`UNIQUE(network, txHash, logIndex)`. Credit happens once, at CONFIRMED, in a
transaction, and sets `deposits.ledgerTransactionId`.

**Modes:** `demo` (simulated, badged) · `sandbox` (real Sepolia) ·
`production` (refuses to boot without custody — not implemented).

---

## 8. Testing plan

| Suite | Asserts |
|---|---|
| `money.spec` | parse/format precision; no float drift |
| `ledger.spec` | entries sum to zero; unbalanced posts rejected |
| `ledger-idempotency.spec` | same key posts once under concurrency |
| `balance.spec` | available never negative; holds reduce available |
| `deposit-dedup.spec` | same (tx, logIndex) credits once |
| `deposit-confirm.spec` | credit only at required confirmations |
| `asa.spec` | over-balance declined; retry reuses the decision |
| `webhook-idempotency.spec` | redelivery processes once |
| `webhook-signature.spec` | tampered body and stale timestamp rejected |
| `cards.spec` | create/freeze/close map to OPEN/PAUSED/CLOSED |
| `rbac.spec` | SUPPORT denied adjustments; role matrix holds |
| `redaction.spec` | PAN/CVV/secrets never appear in log output |

---

## 9. Environment variables

Full list with commentary in `.env.example`. The config layer **refuses to
boot** on unsafe combinations:

- `APP_ENV=production` + `DEPOSIT_MODE=demo` → rejected (fake funds in prod)
- `APP_ENV=production` + `CARD_PROVIDER=mock` → rejected
- `DEPOSIT_MODE=production` without `DEPOSIT_XPUB` → rejected (no custody)
- `DEPOSIT_MODE=sandbox` + `ETHEREUM_MAINNET` → rejected
- `CARD_PROVIDER=lithic` without a key → rejected

---

## 10. Known limitations (carried into the README)

1. **USDT cannot fund a Lithic card.** Missing: custody, off-ramp, program
   manager, licensing.
2. **No TRON**, despite it holding ~half of circulating USDT — Alchemy's
   Address Activity webhooks do not document it.
3. **Sepolia has no canonical USDT** — the test contract is configurable.
4. **Deposits are watch-only.** No sweeping, because that needs private keys.
5. **This Lithic key has no Financial Accounts** — verified empty. Book
   transfers and Lithic-side balances are unavailable.
6. **Email is not delivered** — verification and reset tokens are returned in
   development responses and logged, not mailed.
7. **Single-process jobs** — fine for one node; needs a real queue to scale out.
