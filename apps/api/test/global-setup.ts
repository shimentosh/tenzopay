import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Test bootstrap.
 *
 * Integration tests run against a REAL Postgres schema, not a mock. A ledger
 * whose correctness depends on unique constraints and SERIALIZABLE isolation
 * cannot be meaningfully tested against an in-memory fake — the very things
 * being asserted are database behaviours.
 *
 * A separate `tenzopay_test` database is used so a test run can never touch
 * development data.
 */
export default async function setup() {
  for (const candidate of ['.env', '../../.env']) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      break;
    }
  }

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL is required to run the test suite');
  }

  const testUrl =
    process.env.TEST_DATABASE_URL ??
    base.replace(/\/tenzopay(\?|$)/, '/tenzopay_test$1');

  if (testUrl === base) {
    throw new Error(
      'Refusing to run tests against the development database. ' +
        'Set TEST_DATABASE_URL to a dedicated test database.',
    );
  }

  process.env.DATABASE_URL = testUrl;

  // Create the database if it is missing, then sync the schema.
  const adminUrl = base.replace(/\/tenzopay(\?|$)/, '/postgres$1');
  try {
    execSync(
      `node -e "const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.argv[1]});await c.connect();await c.query('CREATE DATABASE tenzopay_test').catch(()=>{});await c.end();})()" "${adminUrl}"`,
      { stdio: 'ignore' },
    );
  } catch {
    // `pg` may not be installed directly; prisma db push will surface any real
    // connection problem with a clearer message.
  }

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
