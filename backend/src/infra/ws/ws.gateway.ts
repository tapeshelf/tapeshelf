import {
  Inject,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';

import type { Env } from '../../config/env.js';
import {
  ACCESS_COOKIE,
  TokenService,
} from '../../modules/auth/token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import {
  PRESENCE_REFRESH_MS,
  markOffline,
  markOnline,
  refreshOnline,
} from './presence.js';
import {
  SESSIONS_REVOKED,
  type SessionsRevokedPayload,
  WS_CHANNEL,
  WS_CONNECT_ERROR,
  type UserEventMessage,
} from './ws-events.js';

type UserSocket = Socket & { data: { userId?: string; sessionId?: string } };

/**
 * One socket.io server at /ws. A connection is accepted only with a valid access cookie and a
 * same-site Origin (cookie-authenticated websockets need the same CSRF care as HTTP); each user
 * joins their own room and the API pushes per-user events into it.
 *
 * The check runs in the handshake middleware, not in `handleConnection`: a refused handshake then
 * reaches the client as `connect_error` with a code (WS_CONNECT_ERROR), and the client knows to
 * renew its session and connect again. A socket dropped after connecting gets "io server
 * disconnect", which socket.io does not retry, and the app stayed without live updates until a
 * reload.
 */
@WebSocketGateway({ path: '/ws', serveClient: false })
export class WsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer() server?: Server;
  private readonly logger = new Logger(WsGateway.name);
  private readonly allowedOrigins: Set<string>;
  private subscriber: Redis | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.allowedOrigins = new Set([
      new URL(config.get('PUBLIC_URL', { infer: true })).origin,
    ]);
    if (config.get('NODE_ENV', { infer: true }) !== 'production')
      this.allowedOrigins
        .add('http://localhost:4200')
        .add('http://localhost:3000');
  }

  /** Events published by other processes (the worker's notification relay) reach the sockets through Redis. */
  async onModuleInit(): Promise<void> {
    const sub = this.redis.duplicate();
    sub.on('message', (_channel: string, raw: string) => {
      try {
        const msg = JSON.parse(raw) as UserEventMessage;
        if (typeof msg.userId !== 'string' || typeof msg.event !== 'string')
          return;
        if (msg.event === SESSIONS_REVOKED)
          void this.dropSessions(
            msg.userId,
            (msg.payload ?? {}) as SessionsRevokedPayload,
          );
        else this.emitToUser(msg.userId, msg.event, msg.payload);
      } catch {
        /* ignore malformed messages */
      }
    });
    sub.on('error', (err: Error) =>
      this.logger.warn(`Redis subscriber: ${err.message}`),
    );
    await sub.subscribe(WS_CHANNEL);
    this.subscriber = sub;
    // Keep the presence keys of connected users alive (see presence.ts).
    this.presenceTimer = setInterval(
      () => void this.refreshPresence(),
      PRESENCE_REFRESH_MS,
    );
    this.presenceTimer.unref();
  }

  private async refreshPresence(): Promise<void> {
    if (!this.server) return;
    const ids = new Set<string>();
    for (const socket of (await this.server.fetchSockets()) as unknown as UserSocket[])
      if (socket.data.userId) ids.add(socket.data.userId);
    if (ids.size) await refreshOnline(this.redis, ids).catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    this.presenceTimer = null;
    await this.subscriber?.quit().catch(() => undefined);
    this.subscriber = null;
  }

  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.authenticate(socket as UserSocket).then(
        (code) => next(code ? connectError(code) : undefined),
        () => next(connectError(WS_CONNECT_ERROR.sessionExpired)),
      );
    });
  }

  /** Who the handshake belongs to; a code when it is refused. */
  private async authenticate(
    socket: UserSocket,
  ): Promise<keyof typeof WS_CONNECT_ERROR | null> {
    const origin = socket.handshake.headers.origin;
    if (origin && !this.allowedOrigins.has(origin))
      return WS_CONNECT_ERROR.forbidden;
    const token = parseCookies(socket.handshake.headers.cookie)[ACCESS_COOKIE];
    const claims = token
      ? await this.tokens.verifyAccess(token).catch(() => null)
      : null;
    if (!claims) return WS_CONNECT_ERROR.sessionExpired;
    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      select: {
        revokedAt: true,
        expiresAt: true,
        userId: true,
        user: { select: { status: true } },
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.userId !== claims.sub ||
      session.user.status !== 'ACTIVE'
    )
      return WS_CONNECT_ERROR.sessionExpired;
    socket.data.userId = claims.sub;
    socket.data.sessionId = claims.sid;
    return null;
  }

  async handleConnection(socket: UserSocket): Promise<void> {
    const userId = socket.data.userId;
    if (!userId) return (socket.disconnect(true), undefined);
    await socket.join(room(userId));
    await markOnline(this.redis, userId).catch(() => undefined);
  }

  async handleDisconnect(socket: UserSocket): Promise<void> {
    // Rooms are left automatically; only authenticated sockets were counted as online.
    if (socket.data.userId)
      await markOffline(this.redis, socket.data.userId).catch(() => undefined);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(room(userId)).emit(event, payload);
  }

  /** Closes the sockets of revoked sessions: they would keep receiving the user's events. */
  private async dropSessions(
    userId: string,
    p: SessionsRevokedPayload,
  ): Promise<void> {
    if (!this.server) return;
    const sockets = (await this.server
      .in(room(userId))
      .fetchSockets()) as unknown as UserSocket[];
    for (const socket of sockets) {
      const sid = socket.data.sessionId;
      if (p.sessionIds && !p.sessionIds.includes(sid ?? '')) continue;
      if (p.exceptSessionId && sid === p.exceptSessionId) continue;
      socket.disconnect(true);
    }
  }

  /** Number of live sockets of a user (tests, diagnostics). */
  async connectionsOf(userId: string): Promise<number> {
    if (!this.server) return 0;
    return (await this.server.in(room(userId)).fetchSockets()).length;
  }
}

function room(userId: string): string {
  return `user:${userId}`;
}

/** The error a refused handshake gives the client: `message` is the code, `data.code` too. */
function connectError(code: string): Error {
  return Object.assign(new Error(code), { data: { code } });
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}
