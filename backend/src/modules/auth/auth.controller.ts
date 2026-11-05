import { CLIENT_HEADER, parseClient } from '../../common/client-version.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Response } from 'express';

import type {
  AppRequest,
  RequestUser,
} from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import { GUEST_COOKIE } from '../deals/guest-keys.js';
import { GuestDealsService } from '../deals/guest-deals.service.js';
import { UsersService } from '../users/users.service.js';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  AppExchangeDto,
  GoogleCompleteDto,
  GoogleCompleteResultDto,
  GoogleStatusDto,
  LoginDto,
  MeDto,
  OkDto,
  RegisterDto,
  ResetPasswordDto,
  SessionDto,
  SessionHintDto,
  TokenDto,
} from './auth.dto.js';
import { AppSignInService } from './app-sign-in.service.js';
import { AuthService } from './auth.service.js';
import { GoogleService, type GoogleIdentity } from './google.service.js';
import { type ClientMeta, SessionService } from './session.service.js';
import { safeReturnTo } from './return-to.js';
import { REFRESH_COOKIE } from './token.service.js';
import {
  PasskeyProofDto,
  TwoFactorCodeDto,
  WebAuthnOptionsDto,
} from './two-factor/two-factor.dto.js';
import {
  LOGIN_TICKET_TTL_SEC,
  type SecondStepProof,
  TwoFactorService,
} from './two-factor/two-factor.service.js';
import { RateLimit } from '../../common/rate-limits.js';
import { SignupCaptchaService } from '../captcha/signup-captcha.service.js';

const OAUTH_COOKIE = 'vs_oauth';
const OAUTH_SIGNUP_COOKIE = 'vs_oauth_signup';
const OAUTH_COOKIE_PATH = '/api/auth/google';
/** The ticket between the password and the second step. */
const SECOND_STEP_COOKIE = 'vs_2fa';
const SECOND_STEP_COOKIE_PATH = '/api/auth/login';

/** Not a failure: the identity has no account yet and goes to the username step. */
class SignUpNeeded extends Error {}

function meta(req: AppRequest): ClientMeta {
  return {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    client: parseClient(req.headers[CLIENT_HEADER])?.raw,
  };
}

/** Only same-site relative paths are accepted as post-login destinations. */

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly publicUrl: string;
  private readonly secure: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly google: GoogleService,
    private readonly appSignIn: AppSignInService,
    private readonly captcha: SignupCaptchaService,
    private readonly twoFactor: TwoFactorService,
    private readonly guests: GuestDealsService,
    config: ConfigService<Env, true>,
  ) {
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
    this.secure = config
      .get('PUBLIC_URL', { infer: true })
      .startsWith('https://');
  }

  @Public()
  @RateLimit('register')
  @Post('register')
  @ApiOperation({
    summary: 'Create an account and sign in; sends the verification email',
  })
  @ApiOkResponse({ type: MeDto })
  @HttpCode(HttpStatus.OK)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    await this.captcha.check(req.ip, dto.captchaToken);
    const tokens = await this.auth.register(
      dto,
      meta(req),
      req.headers['accept-language'],
    );
    await this.captcha.remember(req.ip);
    this.sessions.setCookies(res, tokens);
    await this.adoptGuest(req, res, tokens.userId);
    return this.users.getMe(tokens.userId);
  }

  @Public()
  @RateLimit('login')
  @Post('login')
  @ApiOperation({
    summary:
      'Signs in; with two-step sign-in on, answers 401 twoFactorLogin (details.methods) and the step follows',
  })
  @ApiOkResponse({ type: MeDto })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const outcome = await this.auth.login(dto, meta(req));
    if ('secondStep' in outcome) {
      res.cookie(SECOND_STEP_COOKIE, outcome.secondStep.ticket, {
        httpOnly: true,
        sameSite: 'strict',
        secure: this.secure,
        path: SECOND_STEP_COOKIE_PATH,
        maxAge: LOGIN_TICKET_TTL_SEC * 1000,
      });
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'twoFactorLogin',
        'errors.auth.twoFactorLogin',
        { details: { methods: outcome.secondStep.methods } },
      );
    }
    this.sessions.setCookies(res, outcome);
    await this.adoptGuest(req, res, outcome.userId);
    return this.users.getMe(outcome.userId);
  }

  @Public()
  @RateLimit('twoFactor')
  @Post('login/2fa')
  @ApiOperation({
    summary: "The second step of a sign-in: the app's code or a recovery code",
  })
  @ApiOkResponse({ type: MeDto })
  @HttpCode(HttpStatus.OK)
  loginCode(
    @Body() dto: TwoFactorCodeDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    return this.secondStep({ code: dto.code }, req, res);
  }

  @Public()
  @RateLimit('twoFactor')
  @Post('login/2fa/passkey-options')
  @ApiOperation({ summary: 'Options to answer the second step with a passkey' })
  @ApiOkResponse({ type: WebAuthnOptionsDto })
  @HttpCode(HttpStatus.OK)
  async loginPasskeyOptions(
    @Req() req: AppRequest,
  ): Promise<WebAuthnOptionsDto> {
    return {
      options: await this.twoFactor.loginPasskeyOptions(
        req.cookies?.[SECOND_STEP_COOKIE],
      ),
    };
  }

  @Public()
  @RateLimit('twoFactor')
  @Post('login/2fa/passkey')
  @ApiOperation({ summary: 'The second step of a sign-in with a passkey' })
  @ApiOkResponse({ type: MeDto })
  @HttpCode(HttpStatus.OK)
  loginPasskey(
    @Body() dto: PasskeyProofDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    return this.secondStep(
      { passkey: dto.response as unknown as AuthenticationResponseJSON },
      req,
      res,
    );
  }

  private async secondStep(
    proof: SecondStepProof,
    req: AppRequest,
    res: Response,
  ): Promise<MeDto> {
    const tokens = await this.auth.loginSecondStep(
      req.cookies?.[SECOND_STEP_COOKIE],
      proof,
      meta(req),
    );
    res.clearCookie(SECOND_STEP_COOKIE, { path: SECOND_STEP_COOKIE_PATH });
    this.sessions.setCookies(res, tokens);
    await this.adoptGuest(req, res, tokens.userId);
    return this.users.getMe(tokens.userId);
  }

  /**
   * Signed in or up in a browser that was a guest's: their deals and videos move to the
   * account, and the browser is a guest no more.
   */
  private async adoptGuest(
    req: AppRequest,
    res: Response,
    userId: string,
  ): Promise<void> {
    if (!req.cookies?.[GUEST_COOKIE]) return;
    const guest = await this.guests.guestOf(req);
    if (guest) await this.guests.adopt(guest.id, userId);
    this.guests.clearCookie(res);
  }

  @Public()
  @RateLimit('refresh')
  @Post('refresh')
  @ApiOperation({
    summary: 'Rotate the refresh cookie and issue a new access cookie',
  })
  @ApiOkResponse({ type: MeDto })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) {
      this.sessions.clearCookies(res);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'sessionExpired',
        'errors.auth.sessionExpired',
      );
    }
    try {
      const tokens = await this.auth.refresh(raw, meta(req));
      this.sessions.setCookies(res, tokens);
      return await this.users.getMe(tokens.userId);
    } catch (err) {
      this.sessions.clearCookies(res);
      throw err;
    }
  }

  @Post('logout')
  @ApiCookieAuth()
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkDto> {
    await this.auth.logout(user.sessionId, user.id);
    this.sessions.clearCookies(res);
    return { ok: true };
  }

  @Post('logout-all')
  @ApiCookieAuth()
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkDto> {
    await this.auth.logoutEverywhere(user.id);
    this.sessions.clearCookies(res);
    return { ok: true };
  }

  @Public()
  @Get('session')
  @ApiOperation({
    summary:
      'Who is signed in in this browser, without rotating the session (null for a guest)',
  })
  @ApiOkResponse({ type: SessionHintDto })
  async session(@Req() req: AppRequest): Promise<SessionHintDto> {
    return {
      username: await this.sessions.peek(req.cookies?.[REFRESH_COOKIE]),
    };
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOkResponse({ type: MeDto })
  me(@CurrentUser() user: RequestUser): Promise<MeDto> {
    return this.users.getMe(user.id);
  }

  @Public()
  @RateLimit('verifyEmail')
  @Post('verify-email')
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: TokenDto): Promise<OkDto> {
    await this.auth.verifyEmail(dto.token);
    return { ok: true };
  }

  @RateLimit('resendVerification')
  @Post('resend-verification')
  @ApiCookieAuth()
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async resendVerification(@CurrentUser() user: RequestUser): Promise<OkDto> {
    await this.auth.sendVerification(user.id);
    return { ok: true };
  }

  @Public()
  @RateLimit('forgotPassword')
  @Post('forgot-password')
  @ApiOperation({
    summary: 'Always succeeds; sends a reset link if the email exists',
  })
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<OkDto> {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Public()
  @RateLimit('resetPassword')
  @Post('reset-password')
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<OkDto> {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  @Post('change-password')
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Sets a new password and signs out every other session',
  })
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<OkDto> {
    await this.auth.changePassword(
      user.id,
      user.sessionId,
      dto.currentPassword,
      dto.newPassword,
    );
    return { ok: true };
  }

  @Get('sessions')
  @ApiCookieAuth()
  @ApiOkResponse({ type: SessionDto, isArray: true })
  async listSessions(@CurrentUser() user: RequestUser): Promise<SessionDto[]> {
    const rows = await this.sessions.list(user.id);
    return rows.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      client: s.client,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.id === user.sessionId,
    }));
  }

  @Delete('sessions/:id')
  @ApiCookieAuth()
  @ApiOkResponse({ type: OkDto })
  async revokeSession(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<OkDto> {
    await this.sessions.revoke(id, user.id);
    return { ok: true };
  }

  // ---- Google ----

  @Public()
  @Get('google/status')
  @ApiOkResponse({ type: GoogleStatusDto })
  googleStatus(): GoogleStatusDto {
    return { enabled: this.google.enabled };
  }

  @Public()
  @SkipCsrf()
  @RateLimit('googleStart')
  @Get('google')
  @ApiOperation({ summary: 'Browser navigation endpoint: redirects to Google' })
  async googleStart(
    @Query('returnTo') returnTo: string | undefined,
    // The phone app starts the sign-in with the hash of a secret it keeps, and gets its session
    // by a hand-over instead of this browser's cookies (AppSignInService).
    @Query('app') app: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { url, state, verifier } = await this.google.createAuthorization(
      `${this.publicUrl}/api/auth/google/callback`,
    );
    res.cookie(
      OAUTH_COOKIE,
      JSON.stringify({
        state,
        verifier,
        returnTo: safeReturnTo(returnTo),
        app: this.appSignIn.isChallenge(app) ? app : null,
      }),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.secure,
        signed: true,
        path: OAUTH_COOKIE_PATH,
        maxAge: 10 * 60_000,
      },
    );
    res.redirect(url);
  }

  @Public()
  @SkipCsrf()
  @Get('google/callback')
  @ApiOperation({
    summary:
      'Google redirects here; signs in or sends the browser to the username step',
  })
  async googleCallback(
    @Req() req: AppRequest,
    @Res() res: Response,
  ): Promise<void> {
    const stored = req.signedCookies?.[OAUTH_COOKIE];
    res.clearCookie(OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });
    let identity: GoogleIdentity;
    let returnTo: string | null = null;
    // Set when the phone app started this sign-in: nothing of it stays in the browser.
    let app: string | null = null;
    try {
      if (typeof stored !== 'string') throw new Error('missing oauth cookie');
      const parsed = JSON.parse(stored) as {
        state: string;
        verifier: string;
        returnTo: string | null;
        app?: string | null;
      };
      returnTo = safeReturnTo(parsed.returnTo);
      app = this.appSignIn.isChallenge(parsed.app) ? parsed.app : null;
      const current = new URL(`${this.publicUrl}/api/auth/google/callback`);
      current.search = new URL(req.originalUrl, this.publicUrl).search;
      identity = await this.google.exchange(
        current,
        parsed.verifier,
        parsed.state,
      );
    } catch {
      res.redirect(
        app
          ? this.appSignIn.returnUrl({ error: 'googleFailed' })
          : `${this.publicUrl}/login?error=googleFailed`,
      );
      return;
    }
    if (app) {
      try {
        const user = await this.auth.resolveGoogleUser(identity);
        if (user) {
          res.redirect(
            this.appSignIn.returnUrl({
              code: await this.appSignIn.issue(user.id, app),
            }),
          );
          return;
        }
      } catch (err) {
        const code =
          err instanceof AppException
            ? (err.getResponse() as { code: string }).code
            : 'googleFailed';
        res.redirect(this.appSignIn.returnUrl({ error: code }));
        return;
      }
    }
    try {
      if (app) throw new SignUpNeeded();
      const tokens = await this.auth.loginWithGoogle(identity, meta(req));
      if (tokens) {
        // Whoever was signed in in this browser before is signed out, not left behind the new cookies.
        await this.sessions.revokeByRefresh(req.cookies?.[REFRESH_COOKIE]);
        this.sessions.setCookies(res, tokens);
        await this.adoptGuest(req, res, tokens.userId);
        res.redirect(`${this.publicUrl}${returnTo ?? `/@${tokens.username}`}`);
        return;
      }
    } catch (err) {
      if (!(err instanceof SignUpNeeded)) {
        const code =
          err instanceof AppException
            ? (err.getResponse() as { code: string }).code
            : 'googleFailed';
        res.redirect(`${this.publicUrl}/login?error=${code}`);
        return;
      }
    }
    // A new person: the username is chosen on the web page in either case; for the app the page
    // ends with the hand-over instead of a session here.
    res.cookie(
      OAUTH_SIGNUP_COOKIE,
      JSON.stringify({ identity, returnTo, app }),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.secure,
        signed: true,
        path: OAUTH_COOKIE_PATH,
        maxAge: 15 * 60_000,
      },
    );
    res.redirect(`${this.publicUrl}/auth/google/complete`);
  }

  @Public()
  @RateLimit('googleComplete')
  @Post('google/complete')
  @ApiOperation({ summary: 'Finish Google sign-up by choosing a username' })
  @ApiOkResponse({ type: GoogleCompleteResultDto })
  @HttpCode(HttpStatus.OK)
  async googleComplete(
    @Body() dto: GoogleCompleteDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GoogleCompleteResultDto> {
    const stored = req.signedCookies?.[OAUTH_SIGNUP_COOKIE];
    if (typeof stored !== 'string')
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'googleSignupExpired',
        'errors.auth.googleSignupExpired',
      );
    const { identity, app } = JSON.parse(stored) as {
      identity: GoogleIdentity;
      app?: string | null;
    };
    await this.captcha.check(req.ip, dto.captchaToken);
    if (this.appSignIn.isChallenge(app)) {
      // Started by the phone app: the account is made, and the app signs in by the hand-over.
      // This browser gets no session and keeps whichever it had.
      const user = await this.auth.createGoogleUser(
        identity,
        dto,
        req.headers['accept-language'],
      );
      await this.captcha.remember(req.ip);
      res.clearCookie(OAUTH_SIGNUP_COOKIE, { path: OAUTH_COOKIE_PATH });
      const result: GoogleCompleteResultDto = await this.users.getMe(user.id);
      result.appRedirect = this.appSignIn.returnUrl({
        code: await this.appSignIn.issue(user.id, app),
      });
      return result;
    }
    const tokens = await this.auth.completeGoogleSignup(
      identity,
      dto,
      meta(req),
      req.headers['accept-language'],
    );
    await this.captcha.remember(req.ip);
    // A sign-up always makes the new account and switches the browser to it: a session that was
    // still alive in this browser (even one the page took for a guest) is ended.
    await this.sessions.revokeByRefresh(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(OAUTH_SIGNUP_COOKIE, { path: OAUTH_COOKIE_PATH });
    this.sessions.setCookies(res, tokens);
    await this.adoptGuest(req, res, tokens.userId);
    return this.users.getMe(tokens.userId);
  }

  @Public()
  @RateLimit('appExchange')
  @Post('app/exchange')
  @ApiOperation({
    summary:
      'The phone app picks up a sign-in the browser handed over: a one-time code and the secret behind the challenge, for a session',
  })
  @ApiOkResponse({ type: MeDto })
  @HttpCode(HttpStatus.OK)
  async appExchange(
    @Body() dto: AppExchangeDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const userId = await this.appSignIn.redeem(dto.code, dto.verifier);
    const tokens = await this.auth.startSession(userId, meta(req));
    this.sessions.setCookies(res, tokens);
    return this.users.getMe(tokens.userId);
  }
}
