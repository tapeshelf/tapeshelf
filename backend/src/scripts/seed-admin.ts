import { PrismaPg } from '@prisma/adapter-pg';

import { hashPassword } from '../common/crypto/password.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Creates (or updates the password and role of) the admin account from ADMIN_* env vars. Safe to
 * re-run. Dev: `npm run seed`; production: `node dist/scripts/seed-admin.js` (no tsx in the image).
 */
export async function seedAdmin(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: must(env, 'DATABASE_URL') }),
  });
  try {
    const email = must(env, 'ADMIN_EMAIL').toLowerCase();
    const username = must(env, 'ADMIN_USERNAME').toLowerCase();
    const passwordHash = await hashPassword(must(env, 'ADMIN_PASSWORD'));
    const admin = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        username,
        displayName: 'Admin',
        passwordHash,
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
      },
      // A self-hosted instance leaves the password as its admin last set it (ADMIN_KEEP_PASSWORD).
      update: {
        ...(env['ADMIN_KEEP_PASSWORD'] === 'true' ? {} : { passwordHash }),
        role: 'ADMIN',
      },
    });
    // A new instance on the internet starts closed; after that the admin decides.
    if (env['INITIAL_REGISTRATION'] === 'closed')
      await prisma.siteSetting.upsert({
        where: { key: 'registrationOpen' },
        create: { key: 'registrationOpen', value: false },
        update: {},
      });
    return `Admin ready: ${admin.email} (/@${admin.username})`;
  } finally {
    await prisma.$disconnect();
  }
}

function must(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

if (process.argv[1] && /seed-admin\.(ts|js)$/.test(process.argv[1]))
  console.log(await seedAdmin());
