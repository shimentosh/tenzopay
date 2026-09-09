#!/usr/bin/env bash
#
# TenzoPay — one command from a fresh clone to three running apps.
#
#   ./start.sh                 bring everything up and run the dev servers
#   ./start.sh --seed          also seed the admin + demo user
#   ./start.sh --reset         drop and rebuild the database first (destructive)
#   ./start.sh --setup-only    do everything except starting the dev servers
#   ./start.sh --no-docker     assume Postgres is already running elsewhere
#   ./start.sh --skip-install  don't touch node_modules
#
# Package manager: npm by default, pnpm if a pnpm-lock.yaml is present.
# Override with  PM=pnpm ./start.sh
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# --- flags -----------------------------------------------------------------
DO_SEED=0
DO_RESET=0
DO_DOCKER=1
DO_INSTALL=1
DO_DEV=1

for arg in "$@"; do
  case "$arg" in
    --seed)         DO_SEED=1 ;;
    --reset)        DO_RESET=1 ;;
    --setup-only)   DO_DEV=0 ;;
    --no-docker)    DO_DOCKER=0 ;;
    --skip-install) DO_INSTALL=0 ;;
    -h|--help)      awk 'NR>1 { if ($0 !~ /^#/) exit; sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)              echo "unknown option: $arg  (try --help)" >&2; exit 2 ;;
  esac
done

# --- output ----------------------------------------------------------------
if [ -t 1 ]; then B=$'\033[1m'; D=$'\033[2m'; R=$'\033[0m'; else B=; D=; R=; fi
step() { printf '%s==>%s %s\n' "$B" "$R" "$1"; }
note() { printf '%s    %s%s\n' "$D" "$1" "$R"; }
die()  { printf '\n%serror:%s %s\n' $'\033[31m' "$R" "$1" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# --- package manager -------------------------------------------------------
PM="${PM:-}"
if [ -z "$PM" ]; then
  if [ -f pnpm-lock.yaml ]; then PM=pnpm; else PM=npm; fi
fi
have "$PM" || die "$PM is not installed."

# --- prerequisites ---------------------------------------------------------
step "Checking prerequisites"
have node || die "Node is not installed. TenzoPay needs Node >= 20.11."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old — TenzoPay needs >= 20.11."
note "node $(node -v), $PM $("$PM" -v)"

# --- environment files -----------------------------------------------------
# Secrets are generated, never copied from the example: the placeholders there
# would boot a JWT signing key that every clone of this repo shares.
gen_secret() { node -e 'console.log(require("crypto").randomBytes(48).toString("base64"))'; }
gen_key32()  { node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'; }

if [ ! -f .env ]; then
  step "Creating .env from .env.example"
  cp .env.example .env
  ACCESS=$(gen_secret); REFRESH=$(gen_secret); ENCKEY=$(gen_key32)
  node - "$ACCESS" "$REFRESH" "$ENCKEY" <<'NODE'
const fs = require('fs');
const [access, refresh, key] = process.argv.slice(2);
const env = fs.readFileSync('.env', 'utf8')
  .replace(/^JWT_ACCESS_SECRET=.*$/m,  `JWT_ACCESS_SECRET=${access}`)
  .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${refresh}`)
  .replace(/^ENCRYPTION_KEY=.*$/m,     `ENCRYPTION_KEY=${key}`)
  // The example ships CARD_PROVIDER=lithic, and config validation refuses to
  // boot with that and no LITHIC_API_KEY. A fresh clone has no key, so start
  // on the mock provider; swap it back once a sandbox key is in place.
  .replace(/^CARD_PROVIDER=.*$/m,      'CARD_PROVIDER=mock');
fs.writeFileSync('.env', env);
NODE
  note "generated JWT secrets and a fresh 32-byte ENCRYPTION_KEY"
  note "no provider keys yet, so CARD_PROVIDER/BLOCKCHAIN_PROVIDER are set to mock"
fi

for app in web admin; do
  if [ ! -f "apps/$app/.env.local" ]; then
    step "Creating apps/$app/.env.local"
    # Browser-visible values only. Anything not NEXT_PUBLIC_* stays server-side.
    grep '^NEXT_PUBLIC_' .env > "apps/$app/.env.local"
  fi
done

# --- database --------------------------------------------------------------
if [ "$DO_DOCKER" -eq 1 ]; then
  have docker || die "Docker is not installed. Start Postgres yourself and re-run with --no-docker."
  docker info >/dev/null 2>&1 || die "Docker is installed but not running — start Docker Desktop and try again."

  step "Starting Postgres (container tenzopay-postgres, host port 55432)"
  docker compose up -d postgres >/dev/null

  printf '    waiting for Postgres'
  for i in $(seq 1 60); do
    if docker compose exec -T postgres pg_isready -U postgres -d tenzopay >/dev/null 2>&1; then
      printf ' ready\n'; break
    fi
    [ "$i" -eq 60 ] && { printf '\n'; die "Postgres did not become ready in 60s. Try: docker compose logs postgres"; }
    printf '.'; sleep 1
  done
fi

# --- dependencies ----------------------------------------------------------
if [ "$DO_INSTALL" -eq 1 ] && [ ! -d node_modules ]; then
  step "Installing dependencies with $PM"
  "$PM" install
elif [ "$DO_INSTALL" -eq 1 ]; then
  note "node_modules present — skipping install (delete it to force a reinstall)"
fi

# --- schema ----------------------------------------------------------------
step "Generating the Prisma client"
"$PM" run db:generate

if [ "$DO_RESET" -eq 1 ]; then
  step "Resetting the database (this drops every table and all data)"
  # --reset always reseeds: an empty database has no admin to log in with.
  ( cd apps/api && npx prisma migrate reset --force )
  DO_SEED=0
else
  step "Applying migrations"
  # `migrate deploy`, not `migrate dev`: deploy only applies migrations that
  # already exist. `dev` would try to author a new one from schema drift and
  # can offer to reset the database — never what starting the app should do.
  ( cd apps/api && npx prisma migrate deploy )
fi

if [ "$DO_SEED" -eq 1 ]; then
  step "Seeding admin + demo data"
  "$PM" run db:seed
fi

# --- go --------------------------------------------------------------------
if [ "$DO_DEV" -eq 0 ]; then
  step "Setup complete — start the apps with: $PM run dev"
  exit 0
fi

# Read the URLs back out of .env rather than printing literals, so this banner
# cannot drift from the ports the apps actually bind.
env_get() { sed -n "s/^$1=//p" .env | tail -1 | tr -d ''; }

step "Starting the dev servers   (ctrl-c stops all three)"
note "customer app   $(env_get WEB_URL)"
note "staff console  $(env_get ADMIN_URL)"
note "API health     $(env_get API_URL)/api/health"
exec "$PM" run dev
