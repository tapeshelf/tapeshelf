import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as oidc from 'openid-client';

import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';

export interface GoogleIdentity {
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/** Google sign-in via OpenID Connect with PKCE (openid-client v6). Optional: disabled when no client id is configured. */
@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private config?: oidc.Configuration;

  constructor(env: ConfigService<Env, true>) {
    this.clientId = env.get('GOOGLE_CLIENT_ID', { infer: true });
    this.clientSecret = env.get('GOOGLE_CLIENT_SECRET', { infer: true });
  }

  get enabled(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  private async configuration(): Promise<oidc.Configuration> {
    if (!this.enabled)
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'googleNotConfigured',
        'errors.auth.googleNotConfigured',
      );
    if (!this.config) {
      this.config = await oidc.discovery(
        new URL('https://accounts.google.com'),
        this.clientId,
        this.clientSecret,
      );
    }
    return this.config;
  }

  async createAuthorization(
    redirectUri: string,
  ): Promise<{ url: string; state: string; verifier: string }> {
    const config = await this.configuration();
    const verifier = oidc.randomPKCECodeVerifier();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    const state = oidc.randomState();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });
    return { url: url.href, state, verifier };
  }

  async exchange(
    currentUrl: URL,
    verifier: string,
    expectedState: string,
  ): Promise<GoogleIdentity> {
    const config = await this.configuration();
    try {
      const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: verifier,
        expectedState,
      });
      const claims = tokens.claims();
      if (!claims?.sub) throw new Error('no id token claims');
      return {
        sub: claims.sub,
        email:
          typeof claims['email'] === 'string' ? claims['email'] : undefined,
        emailVerified: claims['email_verified'] === true,
        name: typeof claims['name'] === 'string' ? claims['name'] : undefined,
        picture:
          typeof claims['picture'] === 'string' ? claims['picture'] : undefined,
      };
    } catch (err) {
      this.logger.warn(
        `Google code exchange failed: ${(err as Error).message}`,
      );
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'googleFailed',
        'errors.auth.googleFailed',
      );
    }
  }
}
