import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

// The other suites run with RATE_LIMITS=false (.env.test). The environment is validated when the
// app module is imported, so the switch has to happen before the imports above run.
vi.hoisted(() => {
  process.env.RATE_LIMITS = 'true';
});

/**
 * Rate limits per account: from one IP every signed-in user has a budget of
 * their own, PREMIUM gets the route's limit × apiRateMultiplier (3), guests count per IP.
 * resend-verification (3 per 15 minutes) answers 400 to a verified account — still a request.
 */
describe('rate limits (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
    process.env.RATE_LIMITS = 'false';
  });

  /** Statuses of `n` resend-verification calls. */
  async function resend(c: ReturnType<typeof client>, n: number) {
    const out: number[] = [];
    for (let i = 0; i < n; i++)
      out.push((await c.post('/api/auth/resend-verification')).status);
    return out;
  }

  it('counts per user, multiplies for PREMIUM, and per IP for guests', async () => {
    const [free1, free2, pro] = [client(app), client(app), client(app)];
    await signUp(app, free1, {
      email: 'a@example.com',
      username: 'free_one',
      password: 'secret123',
    });
    await signUp(app, free2, {
      email: 'b@example.com',
      username: 'free_two',
      password: 'secret123',
    });
    const proId = await signUp(app, pro, {
      email: 'c@example.com',
      username: 'pro_one',
      password: 'secret123',
    });
    await prisma.user.update({
      where: { id: proId },
      data: { tier: 'PREMIUM' },
    });

    expect(await resend(free1, 4)).toEqual([400, 400, 400, 429]);
    // Same IP, another account: a budget of its own.
    expect(await resend(free2, 3)).toEqual([400, 400, 400]);
    const proStatuses = await resend(pro, 10);
    expect(proStatuses.slice(0, 9)).toEqual(Array(9).fill(400));
    expect(proStatuses[9]).toBe(429);

    // Guests: registration is 5 a minute per IP, and three sign-ups above already used three.
    // A fresh client each time: once registered, a client is signed in and counts as that user.
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++)
      statuses.push(
        (
          await client(app)
            .post('/api/auth/register')
            .send({
              email: `g${i}@example.com`,
              username: `guest_${i}`,
              password: 'secret123',
            })
        ).status,
      );
    expect(statuses).toEqual([200, 200, 429]);
  });
});
