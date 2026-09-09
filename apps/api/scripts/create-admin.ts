/**
 * Create or update a console administrator.
 *
 *   npm run admin:create -- --email you@example.com --password 'secret' --role SUPER_ADMIN
 *
 * Bootstrapping the first admin is a real operational need: the console has no
 * self-registration, deliberately, so there has to be an out-of-band way in.
 *
 * The password is read from the command line for convenience in development.
 * In production prefer `--password-stdin`, which keeps the secret out of shell
 * history and out of the process list (`ps` shows argv to other users).
 */
import { AdminRole, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

for (const candidate of ['.env', '../../.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const prefixed = `--${name}`;
  const index = process.argv.indexOf(prefixed);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];

  const inline = process.argv.find((a) => a.startsWith(`${prefixed}=`));
  return inline?.slice(prefixed.length + 1);
}

function readStdin(): Promise<string> {
  return new Promise((resolvePassword) => {
    const rl = createInterface({ input: process.stdin });
    rl.once('line', (line) => {
      rl.close();
      resolvePassword(line.trim());
    });
  });
}

/**
 * Deliberately stricter than the customer rule. A console account can freeze
 * users and post ledger adjustments; it is the highest-value credential in the
 * system.
 */
function validatePassword(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push('must be at least 12 characters');
  if (!/[a-z]/.test(password)) problems.push('must include a lowercase letter');
  if (!/[A-Z]/.test(password)) problems.push('must include an uppercase letter');
  if (!/\d/.test(password)) problems.push('must include a number');
  return problems;
}

async function main(): Promise<void> {
  const email = arg('email')?.toLowerCase().trim();
  const role = (arg('role') ?? 'SUPER_ADMIN').toUpperCase() as AdminRole;
  const name = arg('name');

  const password = process.argv.includes('--password-stdin')
    ? await readStdin()
    : arg('password');

  if (!email || !password) {
    console.error(
      'Usage: npm run admin:create -- --email <email> --password <password> [--role SUPER_ADMIN] [--name "Full Name"]\n' +
        '       ... or --password-stdin to pipe the password instead.',
    );
    process.exit(1);
  }

  if (!Object.values(AdminRole).includes(role)) {
    console.error(
      `Unknown role "${role}". Valid roles: ${Object.values(AdminRole).join(', ')}`,
    );
    process.exit(1);
  }

  const problems = validatePassword(password);
  if (problems.length) {
    console.error(`Password rejected — it ${problems.join(', ')}.`);
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const existing = await prisma.adminUser.findUnique({ where: { email } });

  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      name: name ?? email.split('@')[0],
      role,
      passwordHash,
      isActive: true,
    },
    // Re-running rotates the password rather than failing, which is what you
    // want when someone has lost access.
    update: { role, passwordHash, isActive: true, ...(name ? { name } : {}) },
    select: { id: true, email: true, name: true, role: true },
  });

  // Console access is privileged, so its creation is itself auditable.
  await prisma.auditLog.create({
    data: {
      adminUserId: admin.id,
      actorType: 'SYSTEM',
      action: existing ? 'ADMIN_UPDATED' : 'ADMIN_CREATED',
      entityType: 'AdminUser',
      entityId: admin.id,
      reason: `via create-admin script (${existing ? 'password rotated' : 'initial creation'})`,
    },
  });

  console.log(
    `${existing ? 'Updated' : 'Created'} admin: ${admin.email}  role=${admin.role}`,
  );
  console.log('Sign in at the console (default http://localhost:1333).');
}

main()
  .catch((err) => {
    console.error('Failed to create admin:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
