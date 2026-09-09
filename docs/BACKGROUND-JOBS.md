# Background jobs

Every job in this system exists for the same reason: **a webhook can be lost,
and money must not be lost with it.** Deposits, authorizations and settlements
all arrive as provider callbacks. Each callback that moves money needs a sweep
behind it that reaches the same state without the callback.

All jobs run through `guard()` in `JobsService`, which skips a run if the
previous one is still going. That matters: these are single-process crons, so a
slow pass must not stack.

---

## Running

| Job | Interval | Guards against |
|---|---|---|
| `advanceDepositConfirmations` | 30s | Deposits sitting unconfirmed |
| `reconcileDeposits` | 5m | A deposit webhook that never arrived |
| `retryWebhooks` | 1m | Transient processing failures |
| `verifyLedgerIntegrity` | 10m | Unbalanced postings, negative balances |
| `pruneSessions` | 1h | Expired refresh tokens accumulating |
| **`sweepStaleAuthorizations`** | **1h** | **A hold whose closing webhook was lost** |
| **`watchDepositReorgs`** | **10m** | **A credited deposit re-orged off the chain** |
| **`chargeMonthlyPlans`** | **daily, 02:00** | **Plan revenue going uncollected** |

The last three are new. What the two sweeps do and why:

### `sweepStaleAuthorizations`

A hold is released when Lithic reports the authorization expired, voided or
settled. If that webhook is lost, the hold stays and the cardholder's money is
stranded — indefinitely, because nothing else was looking at it. Deposits had a
reconciliation sweep for exactly this; authorizations had none.

It looks back eight days, past any authorization lifetime, and **asks the
provider** rather than assuming:

- provider reports a state → route it through the same path a webhook takes, so
  settlement, fees and idempotency behave identically
- provider has never heard of it → release the hold, and log at error, because
  a lost webhook is worth investigating
- provider errors → touch nothing, try next hour

Releasing a hold for a transaction that later settles would debit a held
balance that is already empty. That is why it never guesses.

### `watchDepositReorgs`

`advanceConfirmations` stops looking once a deposit is CONFIRMED, so a
transaction re-orged out *after* crediting kept its balance. Twelve
confirmations makes that unlikely; unlikely is not a control.

The reversal is a **compensating transaction**, never an edit — entries are
immutable, and the history should read "credited, then reversed", because that
is what happened. The fee comes back out of revenue with it.

If the customer already spent the money the balance goes negative. That is
deliberate: a ledger that quietly disagreed with the chain would be worse. The
integrity job raises the negative balance for a human, which is the right
escalation for what is effectively a chargeback against us.

---

## Gaps — not built, in priority order

### 1. ~~Monthly plan billing~~ — BUILT

Three decisions were needed and were taken as follows. They are product
choices, so change them if you disagree — the code follows from them.

**A plan is charged once per calendar month**, keyed
`fee:monthly:<userId>:<YYYY-MM>`, not on a per-account anniversary. There is no
proration: a plan change takes effect from the next month, so nobody is charged
twice for one month and a downgrade never needs a refund path.

**An unpayable charge creates no debt.** It is retried daily for
`billing.dunning_days` (default 7) and then the account drops to Starter.
Letting the balance go negative is right for a chargeback, where the money
genuinely left, and wrong for a subscription, where it never arrived.

**Business is not billed here** while `fee.plan.business` is zero — it is priced
case by case, and inventing a number would be worse than charging nothing.

The job runs daily rather than monthly so a failed first-of-month attempt gets
another try, and a plan started mid-month is picked up on the next pass. The
idempotency key is what prevents a second charge, not the schedule.

Staff move an account between plans with `POST /admin/users/:id/plan`, which
demands a reason and writes both an admin action and an audit log.

### 2. Account lockout expiry — blocked on the lockout itself

Recorded as finding 5 in SECURITY-REVIEW.md. Once `failedLoginAttempts` and
`lockedUntil` exist, a job clears expired locks. Not worth building the sweep
before the thing it sweeps.

### 3. Provider health alerting — MEDIUM

`AdminService.health()` reports on the card provider, the chain provider and
the queue, but only when a human opens the page. Nothing watches it. A job that
checks every few minutes and raises an alert when a provider has been down for
more than one interval would catch an outage before customers report it.

Needs an alert channel first — there is no email or Slack transport in this
build, so today it could only log.

### 4. Card expiry notices — LOW

Cards carry `expMonth`/`expYear` and nothing warns anyone. A monthly job that
notifies holders 60 and 14 days out would prevent a subscription failing
silently on a card the customer forgot about.

### 5. Retention — LOW

Notifications and processed webhook events grow without bound. A pruning job
should keep, say, 90 days of each.

**Audit logs and ledger entries must never be pruned.** They are the record.

### 6. KYC status polling — CONDITIONAL

Only needed if the provider can change a holder's status without sending a
webhook. Worth confirming against Lithic's sandbox before writing anything.

---

## Adding a job

1. Put the work in the service that owns the data, not in `JobsService`. The
   job should be a thin call — `sweepStaleAuthorizations` lives in
   `WebhooksService` because it reasons about card transactions.
2. Wrap it in `guard(name, fn)`.
3. Make it idempotent. Every one of these can run twice.
4. Cap the batch (`take: 200`). A sweep that tries to fix everything at once
   will time out and fix nothing.
5. Log at `warn` or `error` when it actually repairs something. A sweep that
   quietly succeeds is a webhook path that quietly broke.
