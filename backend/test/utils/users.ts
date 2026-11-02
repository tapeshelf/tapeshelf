import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import type { client } from './test-app.js';

export interface TestAccount {
  email: string;
  username: string;
  password: string;
  verified?: boolean;
}

/** Registers through the API (so cookies are set on the client) and optionally confirms the email directly in the DB. */
export async function signUp(
  app: NestExpressApplication,
  c: ReturnType<typeof client>,
  account: TestAccount,
): Promise<string> {
  const res = await c
    .post('/api/auth/register')
    .send({
      email: account.email,
      username: account.username,
      password: account.password,
    })
    .expect(200);
  const id = res.body.id as string;
  if (account.verified !== false)
    await app
      .get(PrismaService)
      .user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  return id;
}

/**
 * Makes accounts admins the way the admin panel lets them in: two-step sign-in on, and the
 * sessions they have so far past the second step.
 */
export async function makeAdmin(
  prisma: PrismaService,
  ...ids: string[]
): Promise<void> {
  const now = new Date();
  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { role: 'ADMIN', twoFactorAt: now },
  });
  await prisma.session.updateMany({
    where: { userId: { in: ids } },
    data: { secondFactorAt: now },
  });
}
