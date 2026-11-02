import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { Env } from '../../config/env.js';

/** A ticket starts the download within two minutes; resuming (Range) works while it is valid. */
export const TICKET_TTL_SEC = 120;

export interface DownloadTicket {
  /** Video id. */
  v: string;
  /** User id: the ticket only works with that user's session. */
  u: string;
  /** Ticket id: the first request with it is the one that counts. */
  j: string;
  /** Unix seconds. */
  exp: number;
}

/** HMAC-signed ticket in the `t` query of the file URL (like the playback token). */
@Injectable()
export class DownloadTicketService {
  private readonly secret: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.secret = createHmac(
      'sha256',
      config.get('JWT_SECRET', { infer: true }),
    )
      .update('tapeshelf-download')
      .digest();
  }

  sign(videoId: string, userId: string, now = Date.now()): string {
    const payload: DownloadTicket = {
      v: videoId,
      u: userId,
      j: randomUUID(),
      exp: Math.floor(now / 1000) + TICKET_TTL_SEC,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  verify(token: string | undefined, now = Date.now()): DownloadTicket | null {
    if (!token) return null;
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = this.mac(body);
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return null;
    let payload: DownloadTicket;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as DownloadTicket;
    } catch {
      return null;
    }
    if (
      typeof payload.v !== 'string' ||
      typeof payload.u !== 'string' ||
      typeof payload.j !== 'string' ||
      typeof payload.exp !== 'number'
    )
      return null;
    return payload.exp * 1000 > now ? payload : null;
  }

  private mac(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
