import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

import { AppException } from '../../common/errors/app.exception.js';
import {
  localeFromAcceptLanguage,
  toSupportedLocale,
} from '../../common/i18n/i18n.js';
import { hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { normalizeEmail } from '../../common/validation/email.js';
import {
  checkUsername,
  normalizeUsername,
} from '../../common/validation/username.js';
import type { Env } from '../../config/env.js';
import type {
  EmailTokenType,
  Locale,
  Role,
} from '../../generated/prisma/enums.js';
import { MailDeliveryService } from '../../infra/mail/mail-delivery.service.js';
import {
  renderPasswordReset,
  renderVerifyEmail,
} from '../../infra/mail/templates.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { InvitesService } from '../social/invites.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import type { GoogleIdentity } from './google.service.js';
import { LoginAttemptsService } from './login-attempts.service.js';
import {
  hashToken,
  type ClientMeta,
  type IssuedTokens,
  SessionService,
} from './session.service.js';
import {
  type SecondStepProof,
  type TwoFactorMethod,
  TwoFactorService,
} from './two-factor/two-factor.service.js';

/** A password that fits either signs in, or (two-step sign-in on) hands out the ticket for the step. */
export type LoginOutcome =
  | (IssuedTokens & { userId: string })
  | { secondStep: { ticket: string; methods: TwoFactorMethod[] } };

const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 3600 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly publicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly attempts: LoginAttemptsService,
    private readonly mail: MailDeliveryService,
    private readonly users: UsersService,
    private readonly invites: InvitesService,
    private readonly settings: SettingsService,
    private readonly twoFactor: TwoFactorService,
    config: ConfigService<Env, true>,
  ) {
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
    this.noEmail =
      config.get('DEMO_MODE', { infer: true }) ||
      config.get('EMAIL_DISABLED', { infer: true });
  }

  /** Where no email is sent (the demo; an instance without an email account), addresses count as confirmed. */
  private readonly noEmail: boolean;

  private async assertRegistrationOpen(): Promise<void> {
    if (!(await this.settings.get('registrationOpen')))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'registrationClosed',
        'errors.auth.registrationClosed',
      );
  }

  async register(
    input: {
      email: string;
      username: string;
      password: string;
      displayName?: string;
      showSensitive?: boolean;
    },
    meta: ClientMeta,
    acceptLanguage: string | undefined,
  ): Promise<IssuedTokens & { userId: string }> {
    await this.assertRegistrationOpen();
    const email = normalizeEmail(input.email);
    const username = normalizeUsername(input.username);
    this.assertUsernameFormat(username);
    if (
      await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'emailTaken',
        'errors.auth.emailTaken',
      );
    }
    await this.users.assertUsernameAvailable(username);
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        displayName: input.displayName?.trim() || username,
        passwordHash: await hashPassword(input.password),
        locale: localeFromAcceptLanguage(acceptLanguage),
        showSensitive: input.showSensitive ?? false,
        lastLoginAt: new Date(),
        emailVerifiedAt: this.noEmail ? new Date() : null,
      },
      select: {
        id: true,
        role: true,
        email: true,
        displayName: true,
        locale: true,
      },
    });
    if (!this.noEmail) await this.sendVerification(user.id);
    const tokens = await this.sessions.create(user, meta);
    return { ...tokens, userId: user.id };
  }

  async login(
    input: { email: string; password: string },
    meta: ClientMeta,
  ): Promise<LoginOutcome> {
    const email = normalizeEmail(input.email);
    await this.attempts.assertAllowed(email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        status: true,
        passwordHash: true,
        twoFactorAt: true,
      },
    });
    const ok = user?.passwordHash
      ? await verifyPassword(user.passwordHash, input.password)
      : false;
    if (!user || !ok || user.status === 'DELETED') {
      await this.attempts.recordFailure(email);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'invalidCredentials',
        'errors.auth.invalidCredentials',
      );
    }
    if (user.status === 'BANNED')
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'accountBanned',
        'errors.auth.accountBanned',
      );
    await this.attempts.reset(email);
    if (user.twoFactorAt)
      return { secondStep: await this.twoFactor.startLogin(user.id) };
    return this.signIn(user, meta);
  }

  /** The second step after the password: the ticket from login, then a code or a passkey. */
  async loginSecondStep(
    ticket: string | undefined,
    proof: SecondStepProof,
    meta: ClientMeta,
  ): Promise<IssuedTokens & { userId: string }> {
    const userId = await this.twoFactor.finishLogin(ticket, proof);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (user.status === 'BANNED')
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'accountBanned',
        'errors.auth.accountBanned',
      );
    if (user.status !== 'ACTIVE')
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'invalidCredentials',
        'errors.auth.invalidCredentials',
      );
    return this.signIn(user, meta, true);
  }

  private async signIn(
    user: { id: string; role: Role },
    meta: ClientMeta,
    secondFactor = false,
  ): Promise<IssuedTokens & { userId: string }> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const tokens = await this.sessions.create(user, meta, secondFactor);
    return { ...tokens, userId: user.id };
  }

  logout(sessionId: string, userId: string): Promise<void> {
    return this.sessions.revoke(sessionId, userId);
  }

  logoutEverywhere(userId: string): Promise<void> {
    return this.sessions.revokeAll(userId);
  }

  refresh(rawRefresh: string, meta: ClientMeta) {
    return this.sessions.rotate(rawRefresh, meta);
  }

  // ---- email verification ----

  async sendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        locale: true,
        emailVerifiedAt: true,
      },
    });
    if (!user.email) return;
    if (user.emailVerifiedAt)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'emailAlreadyVerified',
        'errors.auth.emailAlreadyVerified',
      );
    const raw = await this.issueEmailToken(
      user.id,
      'VERIFY_EMAIL',
      VERIFY_TTL_MS,
    );
    const link = `${this.publicUrl}/verify-email?token=${raw}`;
    void this.mail.deliver(
      user.email,
      renderVerifyEmail(user.locale, { name: user.displayName, link }),
    );
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.consumeEmailToken(rawToken, 'VERIFY_EMAIL');
    await this.prisma.user.update({
      where: { id: token.userId },
      data: { emailVerifiedAt: new Date() },
    });
    // An invitation accepted before confirming becomes the friendship now.
    await this.invites.onVerified(token.userId);
  }

  // ---- password reset / change ----

  async forgotPassword(emailInput: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        locale: true,
        status: true,
      },
    });
    if (!user || !user.email || user.status !== 'ACTIVE') return; // never reveal whether the email exists
    const raw = await this.issueEmailToken(
      user.id,
      'RESET_PASSWORD',
      RESET_TTL_MS,
    );
    const link = `${this.publicUrl}/reset-password?token=${raw}`;
    void this.mail.deliver(
      user.email,
      renderPasswordReset(user.locale, { name: user.displayName, link }),
    );
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const token = await this.consumeEmailToken(rawToken, 'RESET_PASSWORD');
    await this.prisma.user.update({
      where: { id: token.userId },
      data: {
        passwordHash: await hashPassword(password),
        emailVerifiedAt: { set: new Date() },
      },
    });
    await this.sessions.revokeAll(token.userId);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string | undefined,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (user.passwordHash) {
      const ok = currentPassword
        ? await verifyPassword(user.passwordHash, currentPassword)
        : false;
      if (!ok)
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'wrongPassword',
          'errors.auth.wrongPassword',
        );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.sessions.revokeAll(userId, sessionId);
  }

  // ---- Google ----

  /** Existing OAuth link, or an existing account with the same verified email; otherwise null → sign-up step. */
  async loginWithGoogle(
    identity: GoogleIdentity,
    meta: ClientMeta,
  ): Promise<(IssuedTokens & { userId: string; username: string }) | null> {
    const user = await this.resolveGoogleUser(identity);
    if (!user) return null;
    const tokens = await this.sessions.create(user, meta);
    return { ...tokens, userId: user.id, username: user.username };
  }

  /**
   * The account a Google identity signs in to, with no session started: the browser gets one
   * from `loginWithGoogle`, the phone app starts its own after the hand-over (AppSignInService).
   */
  async resolveGoogleUser(
    identity: GoogleIdentity,
  ): Promise<{ id: string; role: Role; username: string } | null> {
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: 'GOOGLE',
          providerUserId: identity.sub,
        },
      },
      select: {
        user: {
          select: { id: true, role: true, status: true, username: true },
        },
      },
    });
    let user = linked?.user ?? null;
    if (user?.role === 'ADMIN' && user.status === 'ACTIVE') throw adminGoogle();
    if (!user && identity.email && identity.emailVerified) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: normalizeEmail(identity.email) },
        select: {
          id: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          username: true,
          twoFactorAt: true,
        },
      });
      if (byEmail?.status === 'ACTIVE' && byEmail.role === 'ADMIN')
        throw adminGoogle();
      // Whoever holds the mailbox can make a Google account on it: that must not open an account
      // the second step guards. A Google account already linked stays trusted.
      if (byEmail?.status === 'ACTIVE' && byEmail.twoFactorAt)
        throw new AppException(
          HttpStatus.CONFLICT,
          'googleLinkTwoFactor',
          'errors.auth.googleLinkTwoFactor',
        );
      if (byEmail && byEmail.status === 'ACTIVE') {
        await this.prisma.$transaction([
          this.prisma.oAuthAccount.create({
            data: {
              provider: 'GOOGLE',
              providerUserId: identity.sub,
              email: identity.email,
              userId: byEmail.id,
            },
          }),
          // Nobody ever proved this address was theirs, so whoever registered it may not be the
          // person Google just vouched for: the account goes to that person alone.
          this.prisma.user.update({
            where: { id: byEmail.id },
            data: byEmail.emailVerifiedAt
              ? {}
              : { emailVerifiedAt: new Date(), passwordHash: null },
          }),
        ]);
        if (!byEmail.emailVerifiedAt) await this.sessions.revokeAll(byEmail.id);
        user = byEmail;
      }
    }
    if (!user) return null;
    if (user.status === 'BANNED')
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'accountBanned',
        'errors.auth.accountBanned',
      );
    if (user.status !== 'ACTIVE') return null;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return { id: user.id, role: user.role, username: user.username };
  }

  async completeGoogleSignup(
    identity: GoogleIdentity,
    input: { username: string; displayName?: string; showSensitive?: boolean },
    meta: ClientMeta,
    acceptLanguage: string | undefined,
  ): Promise<IssuedTokens & { userId: string }> {
    const user = await this.createGoogleUser(identity, input, acceptLanguage);
    const tokens = await this.sessions.create(user, meta);
    return { ...tokens, userId: user.id };
  }

  /** The new account of a Google sign-up, with no session started (see `resolveGoogleUser`). */
  async createGoogleUser(
    identity: GoogleIdentity,
    input: { username: string; displayName?: string; showSensitive?: boolean },
    acceptLanguage: string | undefined,
  ): Promise<{ id: string; role: Role }> {
    await this.assertRegistrationOpen();
    const username = normalizeUsername(input.username);
    this.assertUsernameFormat(username);
    await this.users.assertUsernameAvailable(username);
    const email = identity.email ? normalizeEmail(identity.email) : null;
    if (
      email &&
      (await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }))
    ) {
      // Unverified Google email colliding with a local account: do not merge silently.
      throw new AppException(
        HttpStatus.CONFLICT,
        'emailTaken',
        'errors.auth.emailTaken',
      );
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        emailVerifiedAt: email && identity.emailVerified ? new Date() : null,
        username,
        displayName:
          input.displayName?.trim() || identity.name?.trim() || username,
        locale: localeFromAcceptLanguage(acceptLanguage),
        showSensitive: input.showSensitive ?? false,
        lastLoginAt: new Date(),
        oauthAccounts: {
          create: {
            provider: 'GOOGLE',
            providerUserId: identity.sub,
            email: identity.email,
          },
        },
      },
      select: { id: true, role: true },
    });
    return user;
  }

  /** A session for an account that proved itself elsewhere: the app's side of a hand-over. */
  async startSession(
    userId: string,
    meta: ClientMeta,
  ): Promise<IssuedTokens & { userId: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (user?.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'googleFailed',
        'errors.auth.googleFailed',
      );
    }
    const tokens = await this.sessions.create(user, meta);
    return { ...tokens, userId: user.id };
  }

  // ---- helpers ----

  private assertUsernameFormat(username: string): void {
    const problem = checkUsername(username);
    if (problem === 'invalid')
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'usernameInvalid',
        'errors.auth.usernameInvalid',
      );
    if (problem === 'reserved')
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'usernameReserved',
        'errors.auth.usernameReserved',
      );
  }

  private async issueEmailToken(
    userId: string,
    type: EmailTokenType,
    ttlMs: number,
  ): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          type,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
    return raw;
  }

  private async consumeEmailToken(
    raw: string,
    type: EmailTokenType,
  ): Promise<{ userId: string }> {
    const token = await this.prisma.emailToken.findUnique({
      where: { tokenHash: hashToken(raw) },
    });
    if (!token || token.type !== type || token.usedAt)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'tokenInvalid',
        'errors.auth.tokenInvalid',
      );
    if (token.expiresAt < new Date())
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'tokenExpired',
        'errors.auth.tokenExpired',
      );
    await this.prisma.emailToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
    return { userId: token.userId };
  }

  /** Locale helper for places that only have a header. */
  localeFrom(header: string | undefined): Locale {
    return toSupportedLocale(localeFromAcceptLanguage(header));
  }
}

/** Admins sign in with the password and the second step only. */
const adminGoogle = () =>
  new AppException(
    HttpStatus.FORBIDDEN,
    'adminGoogle',
    'errors.auth.adminGoogle',
  );
