import type { AddressInfo } from 'node:net';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Socket, io } from 'socket.io-client';
import request from 'supertest';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { WsGateway } from '../src/infra/ws/ws.gateway.js';
import {
  CSRF_HEADER,
  client,
  createTestApp,
  resetDatabase,
} from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

/**
 * Websockets follow the session: logging out of one session closes its socket only,
 * a ban (or a password change, a deletion) closes all of them, and a revoked session cannot reconnect.
 */
describe('websocket sessions (e2e)', () => {
  let app: NestExpressApplication;
  let gateway: WsGateway;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    gateway = app.get(WsGateway);
  });

  beforeEach(() => resetDatabase(app));

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ email, password: 'secret123' })
      .expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  }

  function connect(
    cookies: string[],
    headers: Record<string, string> = {},
  ): Promise<Socket> {
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    const socket = io(url, {
      path: '/ws',
      transports: ['websocket'],
      extraHeaders: { cookie, ...headers },
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  const closed = (s: Socket) =>
    new Promise<void>((resolve) => {
      if (s.disconnected) resolve();
      else s.once('disconnect', () => resolve());
    });

  async function waitFor(check: () => Promise<boolean>): Promise<void> {
    for (let i = 0; i < 50; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('condition not met');
  }

  it('logout closes that session’s socket only; a ban closes the rest', async () => {
    const admin = client(app);
    const adminId = await signUp(app, admin, {
      email: 'boss@example.com',
      username: 'boss',
      password: 'secret123',
    });
    await makeAdmin(app.get(PrismaService), adminId);
    const userId = await signUp(app, client(app), {
      email: 'ann@example.com',
      username: 'ann',
      password: 'secret123',
    });
    const first = await login('ann@example.com');
    const second = await login('ann@example.com');
    const a = await connect(first);
    const b = await connect(second);
    await waitFor(async () => (await gateway.connectionsOf(userId)) === 2);

    const cookie = first.map((c) => c.split(';')[0]).join('; ');
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .expect(200);
    await closed(a);
    await waitFor(async () => (await gateway.connectionsOf(userId)) === 1);
    expect(b.connected).toBe(true);
    // The revoked session cannot come back: the handshake is refused with a code the app acts on
    // (renew the session, then connect again — here the renewal would fail and sign it out).
    await expect(connect(first)).rejects.toMatchObject({
      message: 'sessionExpired',
      data: { code: 'sessionExpired' },
    });
    expect(await gateway.connectionsOf(userId)).toBe(1);

    await admin
      .post(`/api/admin/users/${userId}/ban`)
      .send({ reason: 'spam' })
      .expect(200);
    await closed(b);
    await waitFor(async () => (await gateway.connectionsOf(userId)) === 0);
  });

  it('refuses a handshake without a live access cookie or from a foreign site, with a code', async () => {
    await expect(connect([])).rejects.toMatchObject({
      message: 'sessionExpired',
    });
    await expect(connect(['vs_access=forged'])).rejects.toMatchObject({
      message: 'sessionExpired',
    });
    await signUp(app, client(app), {
      email: 'bob@example.com',
      username: 'bob',
      password: 'secret123',
    });
    const cookies = await login('bob@example.com');
    await expect(
      connect(cookies, { origin: 'https://evil.example' }),
    ).rejects.toMatchObject({ message: 'forbidden' });
    const socket = await connect(cookies);
    expect(socket.connected).toBe(true);
  });
});
