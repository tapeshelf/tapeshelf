import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { renderSVG } from 'uqr';

import { verifyPassword } from '../../../common/crypto/password.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { siteName } from '../../../common/i18n/i18n.js';
import { clip } from '../../../common/validation/text.js';
import type { Env } from '../../../config/env.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { MailDeliveryService } from '../../../infra/mail/mail-delivery.service.js';
import { renderTwoFactorNotice } from '../../../infra/mail/templates.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../../infra/redis/redis.module.js';
import { LoginAttemptsService } from '../login-attempts.service.js';
import { SessionService } from '../session.service.js';
import {
  hashRecoveryCode,
  newRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODES,
  seal,
  twoFactorKeys,
  unseal,
} from './two-factor-crypto.js';

/** Changes to the two-step sign-in need the second step passed this recently. */
export const CONFIRM_WINDOW_MS = 10 * 60_000;
/** The ticket between the password and the second step. */
export const LOGIN_TICKET_TTL_SEC = 5 * 60;
const SETUP_TTL_SEC = 15 * 60;
const PASSKEY_TTL_SEC = 5 * 60;
const MAX_PASSKEYS = 10;
const TOTP_PERIOD_SEC = 30;

export type TwoFactorMethod = 'app' | 'passkey';
export type TwoFactorNotice = 'on' | 'off' | 'reset' | 'recoveryUsed';
/** What proves the second step: the app's code (or a recovery code), or a passkey's answer. */
export type SecondStepProof =
  { code: string } | { passkey: AuthenticationResponseJSON };

interface SessionRef {
  id: string;
  sessionId: string;
}

const fail = (status: HttpStatus, code: string, key: string) =>
  new AppException(status, code, `errors.twoFactor.${key}`);

const keys = {
  login: (ticket: string) => `2fa:login:${ticket}`,
  setup: (sessionId: string) => `2fa:setup:${sessionId}`,
  register: (sessionId: string) => `2fa:register:${sessionId}`,
  confirm: (sessionId: string) => `2fa:confirm:${sessionId}`,
  attempts: (userId: string) => `2fa:${userId}`,
};

/**
 * Two-step sign-in: an authenticator app and passkeys as the second step after the
 * password, recovery codes for a lost phone. Optional for users, required for admins; a sign-in with
 * Google skips it (Google is trusted), and admins do not sign in with Google at all.
 */
@Injectable()
export class TwoFactorService {
  private readonly keys: { secret: Buffer; codes: Buffer };
  private readonly rpID: string;
  private readonly origin: string;
  private readonly publicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly attempts: LoginAttemptsService,
    private readonly mail: MailDeliveryService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.keys = twoFactorKeys(config.get('KEK', { infer: true }));
    const url = new URL(config.get('PUBLIC_URL', { infer: true }));
    this.rpID = url.hostname;
    this.origin = url.origin;
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
  }

  // ---- state ----

  async status(user: SessionRef) {
    const [u, session, left] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          role: true,
          twoFactorAt: true,
          totpSecret: true,
          passwordHash: true,
          passkeys: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, createdAt: true, lastUsedAt: true },
          },
        },
      }),
      this.prisma.session.findUnique({
        where: { id: user.sessionId },
        select: { secondFactorAt: true },
      }),
      this.prisma.recoveryCode.count({
        where: { userId: user.id, usedAt: null },
      }),
    ]);
    return {
      enabled: u.twoFactorAt !== null,
      available: u.passwordHash !== null,
      required: u.role === 'ADMIN',
      sessionConfirmed: !!session?.secondFactorAt,
      app: u.totpSecret !== null,
      passkeys: u.passkeys.map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt.toISOString(),
        lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
      })),
      recoveryCodesLeft: u.twoFactorAt ? left : 0,
    };
  }

  /** The ways a sign-in may finish with (recovery codes always may). */
  async methods(userId: string): Promise<TwoFactorMethod[]> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecret: true, _count: { select: { passkeys: true } } },
    });
    return [
      ...(u.totpSecret ? (['app'] as const) : []),
      ...(u._count.passkeys ? (['passkey'] as const) : []),
    ];
  }

  // ---- the authenticator app ----

  async startApp(user: SessionRef, password: string | undefined) {
    await this.assertMayChange(user, password);
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpSecret: true, email: true, username: true },
    });
    if (u.totpSecret)
      throw fail(HttpStatus.CONFLICT, 'twoFactorAppExists', 'appExists');
    const secret = new Secret({ size: 20 });
    await this.redis.set(
      keys.setup(user.sessionId),
      secret.base32,
      'EX',
      SETUP_TTL_SEC,
    );
    const uri = this.totp(secret, u.email ?? u.username).toString();
    const svg = renderSVG(uri, { border: 2 });
    return {
      secret: secret.base32,
      uri,
      qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    };
  }

  async confirmApp(user: SessionRef, code: string): Promise<string[] | null> {
    const base32 = await this.redis.get(keys.setup(user.sessionId));
    if (!base32)
      throw fail(
        HttpStatus.BAD_REQUEST,
        'twoFactorSetupExpired',
        'setupExpired',
      );
    const step = this.matchStep(base32, code);
    if (step === null)
      throw fail(HttpStatus.BAD_REQUEST, 'twoFactorInvalidCode', 'invalidCode');
    // Two tabs set up at once: the first app stays, the second is refused.
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, totpSecret: null },
      data: {
        totpSecret: seal(this.keys.secret, base32),
        totpLastStep: step,
      },
    });
    if (!count)
      throw fail(HttpStatus.CONFLICT, 'twoFactorAppExists', 'appExists');
    await this.redis.del(keys.setup(user.sessionId));
    return this.added(user);
  }

  async removeApp(user: SessionRef): Promise<void> {
    await this.assertConfirmed(user.sessionId);
    await this.remove(user.id, (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { totpSecret: null, totpLastStep: null },
      }),
    );
  }

  // ---- passkeys ----

  async passkeyOptions(
    user: SessionRef,
    password: string | undefined,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    await this.assertMayChange(user, password);
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        username: true,
        displayName: true,
        passkeys: { select: { credentialId: true, transports: true } },
      },
    });
    if (u.passkeys.length >= MAX_PASSKEYS)
      throw fail(HttpStatus.CONFLICT, 'twoFactorPasskeyLimit', 'passkeyLimit');
    const options = await generateRegistrationOptions({
      rpName: siteName(),
      rpID: this.rpID,
      userName: u.username,
      userDisplayName: u.displayName,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: u.passkeys.map((p) => ({
        id: p.credentialId,
        transports: p.transports,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });
    await this.redis.set(
      keys.register(user.sessionId),
      options.challenge,
      'EX',
      PASSKEY_TTL_SEC,
    );
    return options;
  }

  async addPasskey(
    user: SessionRef,
    name: string,
    response: RegistrationResponseJSON,
  ): Promise<string[] | null> {
    const challenge = await this.redis.getdel(keys.register(user.sessionId));
    if (!challenge)
      throw fail(
        HttpStatus.BAD_REQUEST,
        'twoFactorSetupExpired',
        'setupExpired',
      );
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      requireUserVerification: false,
    }).catch(() => null);
    if (!result?.verified)
      throw fail(
        HttpStatus.BAD_REQUEST,
        'twoFactorPasskeyInvalid',
        'passkeyInvalid',
      );
    const { credential } = result.registrationInfo;
    const taken = await this.prisma.passkey.findUnique({
      where: { credentialId: credential.id },
      select: { id: true },
    });
    if (taken)
      throw fail(
        HttpStatus.CONFLICT,
        'twoFactorPasskeyInvalid',
        'passkeyInvalid',
      );
    await this.prisma.passkey.create({
      data: {
        userId: user.id,
        credentialId: credential.id,
        publicKey: new Uint8Array(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? [],
        name: clip(name.trim(), 60) || 'Passkey',
      },
    });
    return this.added(user);
  }

  async removePasskey(user: SessionRef, passkeyId: string): Promise<void> {
    await this.assertConfirmed(user.sessionId);
    await this.remove(user.id, async (tx) => {
      const { count } = await tx.passkey.deleteMany({
        where: { id: passkeyId, userId: user.id },
      });
      if (!count)
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'passkeyNotFound',
          'errors.twoFactor.passkeyNotFound',
        );
    });
  }

  // ---- recovery codes, turning it off ----

  async newRecoveryCodes(user: SessionRef): Promise<string[]> {
    await this.assertConfirmed(user.sessionId);
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorAt: true },
    });
    if (!u.twoFactorAt) throw fail(HttpStatus.CONFLICT, 'twoFactorOff', 'off');
    return this.replaceCodes(user.id);
  }

  async turnOff(user: SessionRef): Promise<void> {
    await this.assertConfirmed(user.sessionId);
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { role: true, twoFactorAt: true },
    });
    if (u.role === 'ADMIN')
      throw fail(HttpStatus.CONFLICT, 'twoFactorAdmin', 'admin');
    if (!u.twoFactorAt) return;
    await this.clear(user.id, 'off');
  }

  /**
   * Everything of the two-step sign-in gone: the owner turning it off, the last way removed, an
   * admin's reset for a lost phone. Sessions stay, but none counts as having passed the step.
   */
  async clear(userId: string, notice: 'off' | 'reset'): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passkey.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorAt: null, totpSecret: null, totpLastStep: null },
      }),
      this.prisma.session.updateMany({
        where: { userId },
        data: { secondFactorAt: null },
      }),
    ]);
    await this.notify(userId, notice);
  }

  // ---- the second step: signing in, confirming in a session ----

  /** After the password: a five-minute ticket for the second step, kept by the browser in a cookie. */
  async startLogin(
    userId: string,
  ): Promise<{ ticket: string; methods: TwoFactorMethod[] }> {
    const ticket = randomBytes(32).toString('base64url');
    await this.redis.set(
      keys.login(ticket),
      JSON.stringify({ userId }),
      'EX',
      LOGIN_TICKET_TTL_SEC,
    );
    return { ticket, methods: await this.methods(userId) };
  }

  async loginPasskeyOptions(
    ticket: string | undefined,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const { userId } = await this.ticket(ticket);
    const options = await this.passkeyChallenge(userId);
    await this.redis.set(
      keys.login(ticket!),
      JSON.stringify({ userId, challenge: options.challenge }),
      'KEEPTTL',
    );
    return options;
  }

  /** The second step of a sign-in; the ticket is spent once it passes. Returns whose it was. */
  async finishLogin(
    ticket: string | undefined,
    proof: SecondStepProof,
  ): Promise<string> {
    const { userId, challenge } = await this.ticket(ticket);
    if ('passkey' in proof)
      // A passkey's challenge answers once, right or wrong.
      await this.redis.set(
        keys.login(ticket!),
        JSON.stringify({ userId }),
        'KEEPTTL',
      );
    await this.prove(userId, proof, challenge);
    await this.redis.del(keys.login(ticket!));
    return userId;
  }

  async confirmPasskeyOptions(
    user: SessionRef,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const options = await this.passkeyChallenge(user.id);
    await this.redis.set(
      keys.confirm(user.sessionId),
      options.challenge,
      'EX',
      PASSKEY_TTL_SEC,
    );
    return options;
  }

  /** The second step again inside a session: for the admin panel, and before changing the step itself. */
  async confirm(user: SessionRef, proof: SecondStepProof): Promise<void> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorAt: true },
    });
    if (!u.twoFactorAt) throw fail(HttpStatus.CONFLICT, 'twoFactorOff', 'off');
    const challenge =
      'passkey' in proof
        ? await this.redis.getdel(keys.confirm(user.sessionId))
        : undefined;
    await this.prove(user.id, proof, challenge ?? undefined);
    await this.prisma.session.update({
      where: { id: user.sessionId },
      data: { secondFactorAt: new Date() },
    });
  }

  /** Throws unless the proof fits; ten misses in 15 minutes lock the step like a password. */
  private async prove(
    userId: string,
    proof: SecondStepProof,
    challenge: string | undefined,
  ): Promise<void> {
    const attempts = keys.attempts(userId);
    await this.attempts.assertAllowed(attempts);
    const ok =
      'code' in proof
        ? (await this.checkApp(userId, proof.code)) ||
          (await this.checkRecovery(userId, proof.code))
        : !!challenge &&
          (await this.checkPasskey(userId, challenge, proof.passkey));
    if (!ok) {
      await this.attempts.recordFailure(attempts);
      throw 'code' in proof
        ? fail(HttpStatus.BAD_REQUEST, 'twoFactorInvalidCode', 'invalidCode')
        : fail(
            HttpStatus.BAD_REQUEST,
            'twoFactorPasskeyInvalid',
            'passkeyInvalid',
          );
    }
    await this.attempts.reset(attempts);
  }

  private async checkApp(userId: string, input: string): Promise<boolean> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecret: true },
    });
    if (!u.totpSecret) return false;
    const step = this.matchStep(unseal(this.keys.secret, u.totpSecret), input);
    if (step === null) return false;
    // A code (or an older one) is taken once: whoever saw it typed cannot use it again.
    const { count } = await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    return count === 1;
  }

  private async checkRecovery(userId: string, input: string): Promise<boolean> {
    if (normalizeRecoveryCode(input).length !== 10) return false;
    const { count } = await this.prisma.recoveryCode.updateMany({
      where: {
        userId,
        codeHash: hashRecoveryCode(this.keys.codes, input),
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    if (!count) return false;
    const left = await this.prisma.recoveryCode.count({
      where: { userId, usedAt: null },
    });
    await this.notify(userId, 'recoveryUsed', left);
    return true;
  }

  private async checkPasskey(
    userId: string,
    challenge: string,
    response: AuthenticationResponseJSON,
  ): Promise<boolean> {
    const passkey = await this.prisma.passkey.findFirst({
      where: { userId, credentialId: String(response?.id) },
    });
    if (!passkey) return false;
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports,
      },
      requireUserVerification: false,
    }).catch(() => null);
    if (!result?.verified) return false;
    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(result.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    return true;
  }

  private async passkeyChallenge(
    userId: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const passkeys = await this.prisma.passkey.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });
    if (!passkeys.length)
      throw fail(HttpStatus.CONFLICT, 'twoFactorNoPasskey', 'noPasskey');
    return generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: passkeys.map((p) => ({
        id: p.credentialId,
        transports: p.transports,
      })),
      userVerification: 'preferred',
    });
  }

  private async ticket(
    ticket: string | undefined,
  ): Promise<{ userId: string; challenge?: string }> {
    const stored = ticket ? await this.redis.get(keys.login(ticket)) : null;
    if (!stored)
      throw fail(HttpStatus.BAD_REQUEST, 'twoFactorExpired', 'expired');
    return JSON.parse(stored) as { userId: string; challenge?: string };
  }

  // ---- helpers ----

  /** Turning it on asks for the password; changing it once it is on, for the step in the last ten minutes. */
  private async assertMayChange(
    user: SessionRef,
    password: string | undefined,
  ): Promise<void> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorAt: true, passwordHash: true },
    });
    if (!u.passwordHash)
      throw fail(
        HttpStatus.CONFLICT,
        'twoFactorNeedsPassword',
        'needsPassword',
      );
    if (u.twoFactorAt) return this.assertConfirmed(user.sessionId);
    if (!password || !(await verifyPassword(u.passwordHash, password)))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'wrongPassword',
        'errors.auth.wrongPassword',
      );
  }

  private async assertConfirmed(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { secondFactorAt: true },
    });
    const at = session?.secondFactorAt?.getTime() ?? 0;
    if (Date.now() - at > CONFIRM_WINDOW_MS)
      throw fail(HttpStatus.FORBIDDEN, 'twoFactorConfirm', 'confirm');
  }

  /** After a way is added the session counts as confirmed; the first way turns the step on. */
  private async added(user: SessionRef): Promise<string[] | null> {
    const now = new Date();
    await this.prisma.session.update({
      where: { id: user.sessionId },
      data: { secondFactorAt: now },
    });
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, twoFactorAt: null },
      data: { twoFactorAt: now },
    });
    if (!count) return null;
    const codes = await this.replaceCodes(user.id);
    // Sessions opened before (maybe not by the owner) would skip the step it asks for from now on.
    await this.sessions.revokeAll(user.id, user.sessionId);
    await this.notify(user.id, 'on');
    return codes;
  }

  /** Removes one way under a lock on the account; an admin keeps at least one, the last one gone turns it off. */
  private async remove(
    userId: string,
    removeIn: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<void> {
    const left = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      await removeIn(tx);
      const u = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          role: true,
          totpSecret: true,
          _count: { select: { passkeys: true } },
        },
      });
      const ways = (u.totpSecret ? 1 : 0) + u._count.passkeys;
      if (!ways && u.role === 'ADMIN')
        throw fail(HttpStatus.CONFLICT, 'twoFactorAdmin', 'admin');
      return ways;
    });
    if (!left) await this.clear(userId, 'off');
  }

  private async replaceCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({
        data: codes.map((code) => ({
          userId,
          codeHash: hashRecoveryCode(this.keys.codes, code),
        })),
      }),
    ]);
    return codes;
  }

  private totp(secret: Secret, label = ''): TOTP {
    return new TOTP({
      issuer: siteName(),
      label,
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: TOTP_PERIOD_SEC,
    });
  }

  /** The time step a six-digit code belongs to (this one or a neighbour, for a slow clock), or null. */
  private matchStep(base32: string, code: string): number | null {
    const token = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(token)) return null;
    const totp = this.totp(Secret.fromBase32(base32));
    const timestamp = Date.now();
    const delta = totp.validate({ token, timestamp, window: 1 });
    return delta === null ? null : totp.counter({ timestamp }) + delta;
  }

  /** Every change is mailed: it may be someone else's doing. */
  private async notify(
    userId: string,
    kind: TwoFactorNotice,
    left?: number,
  ): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, locale: true },
    });
    if (!u?.email) return;
    void this.mail.deliver(
      u.email,
      renderTwoFactorNotice(u.locale, {
        name: u.displayName,
        kind,
        left,
        link: `${this.publicUrl}/settings/security`,
      }),
    );
  }
}
