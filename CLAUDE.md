# CLAUDE.md — working notes for TenzoPay

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for *why*, and
[docs/PLAN.md](docs/PLAN.md) for *what*. This file is the short list of rules
that keep changes from breaking money.

---

## What this product is

One USDT balance → many virtual cards → each card with its own limits, all
spending against the same shared balance.

The balance lives in **TenzoPay's own double-entry ledger**. Lithic issues and
processes the cards. **Auth Stream Access** joins them: Lithic asks us to
approve each authorization, and we answer from the ledger.

## The honest limitation — do not paper over it

USDT deposited here **cannot actually settle a Lithic card**. That requires a
custody provider, a crypto→fiat off-ramp, a program manager / sponsor bank, and
money-transmitter licensing. None of those exist in this repo.

If a change would make simulated money look real, it is the wrong change.

---

## Commands

```bash
docker compose up -d postgres     # Postgres 16 on 5432
npm install                       # workspaces: api, web, admin, shared

npm run db:migrate                # create tables
npm run db:seed                   # admin + demo user + demo data
npm run admin:create -- --email x@y.z --password '…' --role SUPER_ADMIN

npm run dev                       # all three apps together
npm run dev:api                   # NestJS   :1222
npm run dev:web                   # user app :1111
npm run dev:admin                 # admin    :1333

npm test                          # vitest — 160 tests
```

Tests boot the real Nest app over HTTP against a `tenzopay_test` database.
Vitest transforms with SWC, not esbuild, because NestJS DI needs
`emitDecoratorMetadata`. Rate limiting is skipped via `DISABLE_RATE_LIMIT`
(honoured only under `NODE_ENV=test`) and covered on its own in
`throttling.spec.ts`.

| App | Port |
|---|---|
| API | 1222 |
| Web (customers) | 1111 |
| Admin (staff) | 1333 |

Admin is a **separate Next.js app with its own origin and its own cookie**
(`tenzo_admin_access`). Do not merge it into the customer app — the isolation
is the point.

---

## Money rules (non-negotiable)

1. **All money is `BigInt` minor units.** USDT = 6dp, USD = 2dp. Never `number`,
   never `float`. Use `parseAmount` / `formatAmount` from `@tenzopay/shared`.
2. **Never add a `balance` column.** Balances are derived by summing
   `ledger_entries`. A cached balance is the most common source of money bugs.
3. **Every movement is a balanced `LedgerTransaction`.** Entries must sum to
   zero; `LedgerService` enforces it and rejects the post otherwise.
4. **Entries are immutable.** No update, no delete. Corrections are new
   compensating entries.
5. **Every financial write is idempotent** via a natural key, e.g.
   `deposit:<id>:confirm`, `auth:<eventToken>`. Re-posting returns the original.
6. **Balance-affecting reads run at SERIALIZABLE, and MUST be retried.**
   Two cards on one balance race otherwise and both authorizations pass.
   SERIALIZABLE does not queue conflicts — it aborts one side and expects a
   retry, so every such transaction goes through `withSerializableRetry`.
   Without it, ~90% of concurrent authorizations were declined as
   `internal_error` despite the customer having ample funds.
   Match Prisma's wording, not just Postgres's: Prisma reports both conditions
   as "write conflict or a deadlock", which does *not* contain Postgres's own
   phrase "deadlock detected".
7. **Never set a balance directly.** Admin corrections go through
   `postAdjustment()` with a mandatory reason + `admin_actions` + `audit_logs`.
8. **Paginate every list.** The transaction feed is cursor-based on `createdAt`,
   not OFFSET — rows arrive constantly and an offset would skip or repeat them.
   Only return `nextCursor` when `hasMore`, or clients fetch an empty page.

## Security rules

- **Never log or store PAN, CVV, PIN, passwords, API keys, or private keys.**
  Card secrets reach the browser through Lithic's embed iframe and never touch
  our servers — that is what keeps us out of PCI scope.
- All secrets are server-side. Only `NEXT_PUBLIC_*` reaches the browser, and
  nothing secret may be named that.
- Webhook signatures are verified with `timingSafeEqual` plus a timestamp
  window. Never compare signatures with `===`.
- **ASA fails safe**: any error, timeout, or unknown card → decline. Never
  approve on error.
- Validate every boundary with Zod. Errors returned to users are the safe
  `message` on `AppError`; provider payloads stay in the server log.

---

## Lithic facts (verified against sandbox — trust these over tutorials)

- `Authorization: <api-key>` — **raw, no `Bearer` prefix**.
- Card states are `OPEN` / `PAUSED` / `CLOSED`. Our `ACTIVE / FROZEN / CLOSED`
  maps 1:1. **Do not invent states.**
- **Auth Rules V1 has been removed.** Use `/v2/auth_rules`.
- A new rule is created **`SHADOWING` and does not enforce** until
  `POST /v2/auth_rules/{token}/promote`. Forgetting to promote is a silent
  no-op — this bit us during research.
- Rate limits are low: sandbox **1 RPS for writes**. The client backs off on 429
  honouring `retry-after`. Do not remove it.
- `POST` carries an `Idempotency-Key`.
- **This key has no Financial Accounts** (`/v1/financial_accounts` → empty) and
  `/v1/card_programs` → 401 enterprise-only. No Lithic-side ledger or book
  transfers are available.
- Webhook signing follows Standard Webhooks:
  HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`, key = base64
  material after `whsec_`.

## Alchemy facts

- Address Activity webhook signature: HMAC-SHA256 of the **raw body**, hex, in
  `x-alchemy-signature`. Verify against the raw buffer, not the parsed object.
- Use `alchemy_getAssetTransfers` with `category: ["erc20"]` for reconciliation.
- **Always read `rawContract.value` (hex), never `value`** — the latter is a JS
  float and loses precision on large transfers.
- **No TRON.** Alchemy has TRON RPC but Address Activity webhooks are EVM +
  Solana. Do not add TRON silently.
- USDT mainnet: `0xdAC17F958D2ee523a2206206994597C13D831ec7`, **6 decimals**,
  always from env.

---

## UI

Both front-ends use **shadcn/ui** (Radix base, Tailwind v4). Components live in
`src/components/ui/` and are **owned by this repo** — edit them directly rather
than wrapping them.

- The palette lives in `globals.css`, which points shadcn's semantic tokens
  (`--primary`, `--muted`, `--border` …) at the design system in
  `apps/web/DESIGN.md`. **Read that file before touching customer UI.** The
  short version: the page is white and cards are *tinted* (accent hue at 8%),
  depth never comes from a shadow, emphasis never comes from colour, and there
  is at most one accent-filled button per screen. Two font weights only, 400
  and 600.
- **Use semantic classes** (`text-foreground`, `text-muted-foreground`,
  `bg-card`, `border`) rather than raw palette classes. Raw `ink-*`/`brand-*`
  are reserved for the deliberately dark chrome: the card face, the auth panel,
  the console rail, the environment banner.
- `Button` carries two local changes: a `loading` prop (money actions must
  disable and announce `aria-busy`) and a larger size scale.
- `components/ui/primitives.tsx` is the domain layer — `Panel`, `StatusBadge`,
  `Field`, `EmptyState`. `StatusBadge` maps every domain status to a colour in
  one place; add new statuses there, not at call sites.
- Adding a component: `npx shadcn@latest add <name> -c apps/web`. Afterwards fix
  its `cn` import to `@/lib/utils`, and check it has not overwritten
  `button.tsx` or `lib/utils.ts` (the CLI does both).
- **Dark mode is live.** Any new colour must come from a semantic token, or it
  will look correct in one theme and broken in the other. The accent is
  deliberately *identical* in both themes and is always paired with
  `text-content-on-accent` — never `text-white`. Surfaces flip:
  `--surface-raised` is a green tint on white and a white tint on near-black.

## Code layout

Business logic lives in `apps/api/src/**` services. React components render;
they do not decide money. Vendors are reached only through `CardProvider` and
`BlockchainProvider` — no controller or service imports a Lithic or Alchemy
class directly.

Adding a provider = one adapter + one line in `providers.module.ts`.

## Conventions

- Comments explain **why**, not what. The tricky invariants deserve a note; a
  getter does not.
- Prefer failing at boot (config validation) over failing during a payment.
- New tables need indexes and, if they touch money, a uniqueness constraint that
  makes the operation idempotent.
