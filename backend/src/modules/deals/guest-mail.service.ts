import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { t } from '../../common/i18n/i18n.js';
import type { Locale, NotificationType } from '../../generated/prisma/enums.js';
import { MailDeliveryService } from '../../infra/mail/mail-delivery.service.js';
import {
  type GuestDealMailKind,
  renderGuestDealMail,
} from '../../infra/mail/templates.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AnonymousLinksService } from '../anonymous-links/anonymous-links.service.js';
import { guestKeyBox, unsealGuestKey } from './guest-keys.js';

/** What each move of the other side tells a guest. */
function kindOf(
  type: NotificationType,
  payload: Record<string, unknown>,
): GuestDealMailKind | null {
  switch (type) {
    case 'OFFER_RECEIVED':
      return 'offer';
    case 'EXCHANGE_COMPLETED':
      return 'accepted';
    case 'REQUEST_SHARED':
      return 'shared';
    case 'REQUEST_DECLINED':
      return 'declined';
    case 'REQUEST_INVALIDATED':
      return payload['reason'] === 'expired' ? 'expired' : 'closed';
    default:
      return null;
  }
}

/**
 * Mails to guests: only to an address the guest confirmed, each with the link back to the
 * deal (their key in it, so it works from any device).
 */
@Injectable()
export class GuestMailService {
  private readonly box: Buffer;
  private readonly publicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailDeliveryService,
    private readonly anonymous: AnonymousLinksService,
    config: ConfigService<Env, true>,
  ) {
    this.box = guestKeyBox(config.get('KEK', { infer: true }));
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
  }

  /** The deal's address with the guest's key: opening it lets this browser in. */
  dealLink(dealId: string, sealedKey: string): string {
    return `${this.publicUrl}/deal/${dealId}?k=${unsealGuestKey(this.box, sealedKey)}`;
  }

  /**
   * The address was given (no confirmation): the deal's link to keep, the same that every
   * later mail carries.
   */
  async saved(guestId: string, dealId: string): Promise<void> {
    const guest = await this.prisma.user.findUnique({
      where: { id: guestId },
      select: { guestEmail: true, guestKeySealed: true, locale: true },
    });
    if (!guest?.guestEmail || !guest.guestKeySealed) return;
    void this.mail.deliver(
      guest.guestEmail,
      renderGuestDealMail(guest.locale, {
        kind: 'saved',
        name: await this.holderName(dealId, guest.locale),
        link: this.dealLink(dealId, guest.guestKeySealed),
      }),
    );
  }

  /** A move of the other side, to the guest's address if they gave one. */
  async news(
    guestId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const kind = kindOf(type, payload);
    const dealId = payload['requestId'];
    if (!kind || typeof dealId !== 'string') return;
    const guest = await this.prisma.user.findUnique({
      where: { id: guestId },
      select: {
        status: true,
        guestEmail: true,
        guestKeySealed: true,
        locale: true,
      },
    });
    if (guest?.status !== 'GUEST' || !guest.guestEmail || !guest.guestKeySealed)
      return;
    void this.mail.deliver(
      guest.guestEmail,
      renderGuestDealMail(guest.locale, {
        kind,
        name: await this.holderName(dealId, guest.locale),
        link: this.dealLink(dealId, guest.guestKeySealed),
      }),
    );
  }

  /** The holder's name, or the one they go by through the anonymous link the deal came by. */
  private async holderName(dealId: string, locale: Locale): Promise<string> {
    const deal = await this.prisma.videoRequest.findUnique({
      where: { id: dealId },
      select: {
        anonymousLinkId: true,
        holder: { select: { displayName: true } },
      },
    });
    if (!deal?.anonymousLinkId) return deal?.holder.displayName ?? '';
    const name = (await this.anonymous.names([deal.anonymousLinkId])).get(
      deal.anonymousLinkId,
    );
    return name || t(locale, 'mail.notifications.anonymous');
  }
}
