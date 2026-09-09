# TenzoPay — local URLs

Start everything with `./start.sh` (or `npm run dev` / `pnpm dev` if the
database is already up).

| What | URL | Notes |
|---|---|---|
| **Customer app** | **http://localhost:1111** | This is the one you want. Redirects to `/login`. |
| **Staff console** | **http://localhost:1333** | Separate app, separate origin, separate cookie (`tenzo_admin_access`). Redirects to `/login`. |
| API | http://localhost:1222 | No page at `/` — it only serves `/api/*`. |
| API health | http://localhost:1222/api/health | `{"status":"ok", ...}` |
| Postgres | `localhost:55432` | db `tenzopay`, user/password `postgres`. Port 55432, not 5432 — a local Postgres already holds 5432/5433 on this machine. |
| Prisma Studio | http://localhost:5555 | Only while `npm run db:studio` is running. |

## Logging in

The seeded accounts are `SEED_ADMIN_EMAIL` (staff console) and
`SEED_DEMO_USER_EMAIL` (customer app), with their passwords, in the root
`.env` — read them there rather than keeping a second copy around.

Seed them, if you have not yet:

```bash
npm run db:seed                                    # admin + demo user + demo data
npm run admin:create -- --email x@y.z --password '…' --role SUPER_ADMIN
```

## If a URL does not answer

```bash
docker compose ps                                  # is Postgres up?
curl -s http://localhost:1222/api/health           # is the API up?
netstat -ano | findstr "1111 1222 1333"            # who holds the port?
```

Next.js quietly moves to the next free port when 1111 or 1333 is taken, so
check the dev server output for the port it actually bound — the front-ends
read `NEXT_PUBLIC_API_URL` from `apps/*/.env.local` and will still expect the
API on 1222.
