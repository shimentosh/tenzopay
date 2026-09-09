# TenzoPay

**One Balance. Every Card.**

A fintech platform where a user holds a single USDT balance and issues many
virtual cards against it, each with its own limits. Cards are *spending
instruments*, not separately funded wallets.

| App | Port | Purpose |
|---|---|---|
| **API** — NestJS | `4000` | ledger, providers, webhooks, authorization decisioning |
| **Web** — Next.js | `3000` | marketing site + customer dashboard |
| **Admin** — Next.js | `7317` | staff console, separate origin and session |
| Postgres | `55432` | see note in [Setup](#setup) |

---

## Read this first

> **USDT deposited into TenzoPay cannot actually settle a card payment.**

This is a real architectural limit, not an unfinished feature, and the build
does not pretend otherwise:

- Lithic does offer native stablecoin funding — but for **USDC** on
  Ethereum/Base/Solana, as a **pilot enabled per programme**. Not USDT, and not
  enabled on this sandbox key (`GET /v1/financial_accounts` returns empty).
- Lithic states plainly that it *"doesn't handle settlement directly."*

Making it real needs four things this repository does not contain: a **custody
provider**, a **crypto→fiat off-ramp**, a **program manager / sponsor bank**,
and **money-transmitter licensing**. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §0.

Everything else — the double-entry ledger, Lithic card issuing, real-time
authorization control, Alchemy chain monitoring, the admin console — is real
and working.

---

## What makes the balance real

A card spend limit is a *per-card ceiling*. Five cards limited to $10,000 each,
against a $10,000 balance, could spend $50,000. Limits alone cannot express a
shared pool. So TenzoPay enforces spending in three independent layers:

| Layer | Enforced by | Scope |
|---|---|---|
| Card `spend_limit` | Lithic | one card, hard ceiling |
| Auth Rules V2 `VELOCITY_LIMIT` | Lithic | one card, per day/month |
| **Auth Stream Access (ASA)** | **TenzoPay ledger** | **the shared balance** |

On every authorization Lithic calls TenzoPay, which checks the ledger, places a
hold, and answers within ~3 s. Any error or timeout **declines** — never
approves.

Measured on the load test: **p95 ≈ 20 ms**, unchanged with 2,000 prior ledger
entries on the account. Ten simultaneous authorizations against one balance
produce zero overdrafts and zero spurious declines.

Verified live against the Lithic sandbox during development:

```
approves $100 within balance and limits          APPROVED
declines $300 over per-transaction limit         VELOCITY_EXCEEDED
declines $9,000 exceeding the shared balance     INSUFFICIENT_FUNDS
replayed event returns the original decision     (no second hold placed)
rejects a tampered signature                     401
rejects a stale timestamp                        401
declines an unknown card                         SUSPECTED_FRAUD
```

---

## Setup

**Requirements:** Node 20.11+, Docker, a Lithic sandbox API key.

```bash
# 1. Database
docker compose up -d postgres

# 2. Dependencies
npm install

# 3. Configuration
cp .env.example .env
#    Then set, at minimum:
#      LITHIC_API_KEY
#      JWT_ACCESS_SECRET / JWT_REFRESH_SECRET   (openssl rand -base64 48)
#      ENCRYPTION_KEY                            (openssl rand -hex 32)
cp .env apps/api/.env
cp .env.example apps/web/.env.local     # keep only NEXT_PUBLIC_* values
cp .env.example apps/admin/.env.local   # keep only NEXT_PUBLIC_* values

# 4. Schema + demo data
npm run db:migrate
npm run db:seed

# 5. Run everything
npm run dev
```

Then open **http://localhost:1111** (customers) and **http://localhost:1333**
(staff).

### Creating a console admin

The console has no self-registration, so the first admin is created out of band:

```bash
npm run admin:create -- --email you@example.com --password 'your-password' --role SUPER_ADMIN
# or, keeping the secret out of shell history and `ps`:
echo 'your-password' | npm run admin:create -- --email you@example.com --password-stdin
```

Re-running rotates the password rather than failing, which is what you want
when someone has lost access. Every run writes an audit entry.

**Staff switcher.** If a customer account and a console account share an email,
the customer portal shows a "Console" link in the header. It is a navigation
hint only — the console is a separate origin with its own password and cookie,
so the link confers no privilege. `rbac.spec` asserts it never appears for a
non-staff account and never opens the console on its own.

### Seeded accounts

| Account | Email | Password |
|---|---|---|
| Customer | `demo@tenzopay.dev` | `ChangeMe!2026` |
| Super admin | `admin@tenzopay.dev` | `ChangeMe!2026` |
| Finance | `finance@tenzopay.dev` | `ChangeMe!2026` |
| Risk | `risk@tenzopay.dev` | `ChangeMe!2026` |
| Support | `support@tenzopay.dev` | `ChangeMe!2026` |

The demo customer starts with a confirmed deposit, three cards and settled
transactions — all posted through the real ledger, so the seed data obeys the
same invariants as production data.

### A note on port 55432

Postgres is published on **55432**, not 5432. Many machines already run a local
Postgres, and two listeners on one port make connections resolve
unpredictably — this was hit during development. Change it in
`docker-compose.yml` and `DATABASE_URL` together if you prefer.

---

## Configuration modes

The app runs fully without any external service:

```bash
CARD_PROVIDER=mock          # no Lithic calls
BLOCKCHAIN_PROVIDER=mock    # simulated chain, 1 block/second
DEPOSIT_MODE=demo           # simulated deposits, badged in the UI
```

Config validation **refuses to boot** on unsafe combinations — an invalid setup
fails at startup rather than during a payment:

| Rejected combination | Why |
|---|---|
| `APP_ENV=production` + `DEPOSIT_MODE=demo` | simulated funds must never look real |
| `APP_ENV=production` + `CARD_PROVIDER=mock` | fake cards in production |
| `DEPOSIT_MODE=production` without `DEPOSIT_XPUB` | no custody configured |
| `DEPOSIT_MODE=sandbox` + `ETHEREUM_MAINNET` | testnet mode pointed at mainnet |
| `CARD_PROVIDER=lithic` without an API key | misconfiguration |

---

## Money rules

1. **All money is `BigInt` minor units.** USDT 6dp, USD 2dp. Never a float.
2. **There is no `balance` column.** Balances are derived by summing immutable
   `ledger_entries`.
3. **Every movement is a balanced transaction** whose entries sum to zero.
4. **Every financial write is idempotent** on a natural key
   (`deposit:<id>:confirm`, `auth:<eventToken>`).
5. **Balance-affecting reads run at SERIALIZABLE** — two cards on one balance
   race otherwise, and both authorizations pass.
6. **No one can set a balance.** Corrections are signed adjustments with a
   mandatory reason, producing double entries plus an audit record.

Four database constraints do the heavy lifting:

| Constraint | Prevents |
|---|---|
| `deposits UNIQUE(network, txHash, logIndex)` | crediting a chain transfer twice |
| `ledger_transactions UNIQUE(idempotencyKey)` | double-posting on retry |
| `webhook_events UNIQUE(provider, eventId)` | processing a redelivery twice |
| `cards UNIQUE(providerCardToken)` | duplicate cards from a retried create |

---

## Security

- **Card numbers never reach these servers.** PAN and CVV are rendered by
  Lithic's iframe directly in the browser — that is what keeps this codebase
  out of PCI DSS scope. Only the last four are stored.
- Argon2id passwords; httpOnly cookies; rotating refresh tokens with reuse
  detection (replaying a rotated token revokes the whole family).
- Webhook signatures verified with `timingSafeEqual` plus a timestamp window.
- Log redaction strips `pan|cvv|pin|password|secret|token|apiKey` and masks any
  Luhn-valid card number appearing in free text.
- Admin runs on its own origin with its own cookie, so a compromised customer
  session cannot reach staff tooling.
- RBAC: `SUPER_ADMIN`, `ADMIN`, `FINANCE`, `RISK`, `SUPPORT`. Support can never
  post a ledger adjustment.

---

## Testing

```bash
npm test
```

160 tests across ten suites. Integration tests boot the **real Nest
application** over HTTP against a real Postgres schema (`tenzopay_test`,
created automatically) — the guarantees under test are database and guard
behaviours, so a mock would assert nothing.

| Suite | Covers |
|---|---|
| `money.spec` | precision, truncation, values beyond 2^53 |
| `ledger.spec` | zero-sum invariant, idempotency, concurrent holds, settlement |
| `deposits.spec` | duplicate prevention, confirmation gating, webhook idempotency |
| `security.spec` | signature verification, replay, encryption, log redaction |
| `auth.spec` | registration validation, enumeration resistance, refresh-token reuse detection |
| `cards.spec` | KYC gating, limit conversion, rule promotion, state transitions, ownership |
| `rbac.spec` | the full role matrix, audit trails, PAN exposure |
| `throttling.spec` | rate limiting with the live guard |
| `pagination.spec` | cursor paging — every row seen exactly once, no loops |
| `asa.spec` | concurrency, latency budget, spurious-decline detection |

The concurrency test is the important one: five simultaneous $300 holds against
a $1,000 balance must leave the balance non-negative.

---

## UI

Both front-ends are built with **shadcn/ui** on Radix and Tailwind v4.
Components are vendored into `src/components/ui/` and owned by this repo.

The palette in `globals.css` maps shadcn's semantic tokens onto TenzoPay's
indigo/ink scales, so every component inherits the brand rather than the
default slate theme. `Button` adds a `loading` prop, because a control that
moves money must disable itself and announce `aria-busy` while in flight.

The customer app includes a **⌘K command palette** for searching cards and
transactions — it replaced a decorative search box that did nothing.

**Dark mode** is supported in both apps via `next-themes` (light / dark /
system). The dark palette is deep navy rather than black: a #000 ground makes
white numerals bloom on OLED, which is the wrong property for a screen full of
figures.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | research findings, verified API tables, risks, compliance assumptions |
| [docs/PLAN.md](docs/PLAN.md) | build plan, data model, feature specification, RBAC matrix |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | webhook and ASA setup, sandbox testing, deployment, production checklist |
| [CLAUDE.md](CLAUDE.md) | working rules and verified provider facts |

---

## Known limitations

1. **USDT cannot fund a card.** Missing: custody, off-ramp, program manager,
   licensing.
2. **No TRON**, despite it holding roughly half of circulating USDT — Alchemy's
   Address Activity webhooks are documented for EVM chains and Solana, so
   supporting it would mean faking it.
3. **Sepolia has no canonical USDT**; the testnet contract is configurable.
4. **Deposits are watch-only.** No sweeping, because that requires private keys.
5. **This Lithic key has no Financial Accounts** — verified empty, so book
   transfers and issuer-side balances are unavailable.
6. **Email is not delivered.** Verification and reset tokens are returned in
   development responses instead of being mailed.
7. **Jobs run in-process.** Correct for one instance; multiple replicas need a
   queue with leader election.
8. **USDT→USD is treated as 1:1.** A real system needs a quoted rate from the
   off-ramp provider.
