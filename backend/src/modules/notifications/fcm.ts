import { createSign } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';

/** The part of a Firebase service account key that sending needs. */
export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

/** What became of one push. */
export type FcmResult =
  | 'sent'
  /** The phone is gone or its address is no longer valid: forget it. */
  | 'gone';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TIMEOUT_MS = 10_000;

/** The key from the environment: its JSON, or that JSON in base64. Null when it is neither. */
export function readServiceAccount(raw: string): ServiceAccount | null {
  for (const text of [raw, Buffer.from(raw, 'base64').toString('utf8')]) {
    try {
      const parsed = JSON.parse(text.trim()) as Partial<ServiceAccount>;
      if (
        parsed.project_id &&
        parsed.client_email &&
        parsed.private_key &&
        parsed.token_uri
      )
        return parsed as ServiceAccount;
    } catch {
      // not this form
    }
  }
  return null;
}

/** A signed request for an access token (OAuth 2.0 JWT bearer grant, RS256). */
export function signedAssertion(account: ServiceAccount, now: number): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const body = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: account.client_email,
    scope: SCOPE,
    aud: account.token_uri,
    iat,
    exp: iat + 3600,
  })}`;
  const signature = createSign('RSA-SHA256')
    .update(body)
    .sign(account.private_key)
    .toString('base64url');
  return `${body}.${signature}`;
}

/**
 * Firebase Cloud Messaging, HTTP v1. Only a signal goes through Google: the id of what
 * the phone should fetch from us. Off without FCM_SERVICE_ACCOUNT.
 */
@Injectable()
export class FcmSender {
  private readonly logger = new Logger(FcmSender.name);
  private readonly account: ServiceAccount | null;
  private readonly apiUrl: string;
  private token: { value: string; until: number } | null = null;

  constructor(config: ConfigService<Env, true>) {
    const raw = config.get('FCM_SERVICE_ACCOUNT', { infer: true });
    this.account = raw ? readServiceAccount(raw) : null;
    if (raw && !this.account)
      this.logger.error(
        'FCM_SERVICE_ACCOUNT is neither a service account key nor its base64: push is off',
      );
    this.apiUrl = config.get('FCM_API_URL', { infer: true }).replace(/\/$/, '');
  }

  get enabled(): boolean {
    return this.account !== null;
  }

  /**
   * Sends [data] to one phone. Throws on what may pass (the network, Google busy, a key Google
   * does not take): the queue tries again later.
   */
  async send(token: string, data: Record<string, string>): Promise<FcmResult> {
    const account = this.account;
    if (!account) throw new Error('Push is not configured');
    const res = await fetch(
      `${this.apiUrl}/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.accessToken(account)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            data,
            // High priority wakes a phone that sleeps; a day later the news is old.
            android: { priority: 'HIGH', ttl: '86400s' },
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.ok) return 'sent';
    const error = await res.text();
    // The address of an app that was removed, or that never was one.
    if (
      res.status === 404 ||
      error.includes('UNREGISTERED') ||
      (res.status === 400 && error.includes('registration token'))
    )
      return 'gone';
    if (res.status === 401) this.token = null;
    throw new Error(`FCM answered ${res.status}: ${error.slice(0, 300)}`);
  }

  private async accessToken(account: ServiceAccount): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.until > now) return this.token.value;
    const res = await fetch(account.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedAssertion(account, now),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok)
      throw new Error(
        `The push key was refused: ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
    const body = (await res.json()) as {
      access_token: string;
      expires_in?: number;
    };
    // Renewed five minutes before it runs out.
    this.token = {
      value: body.access_token,
      until: now + ((body.expires_in ?? 3600) - 300) * 1000,
    };
    return body.access_token;
  }
}
