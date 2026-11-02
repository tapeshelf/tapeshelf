import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Env } from '../../config/env.js';

export const PLAYBACK_TOKEN_TTL_SEC = 3600;

export interface PlaybackToken {
  /** Video id the token is bound to. */
  v: string;
  /** User id, or null for a guest (guests only ever get tokens for public videos). */
  s: string | null;
  /** Unix seconds. */
  exp: number;
  /**
   * The HLS key version the token plays: an edit swaps in a new one, and a player that began
   * on the old version keeps its playlist and key until it is done. Absent: the video's current one.
   */
  k?: number;
  /** For the editor (the original): it plays while the video is being edited. */
  e?: 1;
  /**
   * Given on a temporary link's page: the link, not a person, is what may watch, so it
   * plays without a session while the link still carries the video.
   */
  l?: string;
  /**
   * Given on a guest's deal page: the deal, not a person, is what may watch — the guest
   * received the video and their week to watch it is not over.
   */
  d?: string;
}

/** Compact HMAC token carried in the `t` query of playlist and key URLs. */
@Injectable()
export class PlaybackTokenService {
  private readonly secret: Buffer;

  constructor(config: ConfigService<Env, true>) {
    // Domain-separated from the access-token secret.
    this.secret = createHmac(
      'sha256',
      config.get('JWT_SECRET', { infer: true }),
    )
      .update('tapeshelf-playback')
      .digest();
  }

  sign(
    videoId: string,
    subject: string | null,
    ttlSec = PLAYBACK_TOKEN_TTL_SEC,
    keyVersion?: number,
    editor = false,
    linkId?: string,
    dealId?: string,
  ): string {
    const payload: PlaybackToken = {
      v: videoId,
      s: subject,
      exp: Math.floor(Date.now() / 1000) + ttlSec,
      ...(keyVersion !== undefined ? { k: keyVersion } : {}),
      ...(editor ? { e: 1 as const } : {}),
      ...(linkId ? { l: linkId } : {}),
      ...(dealId ? { d: dealId } : {}),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  verify(token: string | undefined, now = Date.now()): PlaybackToken | null {
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
    let payload: PlaybackToken;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as PlaybackToken;
    } catch {
      return null;
    }
    if (typeof payload.v !== 'string' || typeof payload.exp !== 'number')
      return null;
    if (payload.s !== null && typeof payload.s !== 'string') return null;
    if (payload.k !== undefined && !Number.isInteger(payload.k)) return null;
    if (payload.e !== undefined && payload.e !== 1) return null;
    if (payload.l !== undefined && typeof payload.l !== 'string') return null;
    if (payload.d !== undefined && typeof payload.d !== 'string') return null;
    return payload.exp * 1000 > now ? payload : null;
  }

  private mac(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
