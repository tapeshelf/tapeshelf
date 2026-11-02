import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';

import type { Env } from '../../config/env.js';
import type { Role } from '../../generated/prisma/enums.js';

export const ACCESS_COOKIE = 'vs_access';
export const REFRESH_COOKIE = 'vs_refresh';
export const ACCESS_TTL_SEC = 15 * 60;

export interface AccessClaims {
  sub: string;
  sid: string;
  role: Role;
}

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;

  constructor(config: ConfigService<Env, true>) {
    this.secret = new TextEncoder().encode(
      config.get('JWT_SECRET', { infer: true }),
    );
  }

  signAccess(userId: string, sessionId: string, role: Role): Promise<string> {
    return new SignJWT({ sid: sessionId, role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SEC}s`)
      .sign(this.secret);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.secret, {
      algorithms: ['HS256'],
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload['sid'] !== 'string' ||
      typeof payload['role'] !== 'string'
    ) {
      throw new Error('malformed access token');
    }
    return {
      sub: payload.sub,
      sid: payload['sid'],
      role: payload['role'] as Role,
    };
  }
}
