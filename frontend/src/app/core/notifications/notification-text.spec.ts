import { describe, expect, it } from 'vitest';

import { type NotificationDto } from '../../api';
import { describeNotification } from './notification-text';
import { panelLink } from '../navigation/panels';

const base = { id: 'n1', readAt: null, createdAt: '2026-10-12T00:00:00.000Z' };

describe('describeNotification', () => {
  it('links processed videos to the video page', () => {
    const view = describeNotification({
      ...base,
      type: 'VIDEO_PROCESSED',
      payload: { videoId: 'v1', title: 'Trip' },
    } as NotificationDto);
    expect(view).toEqual({
      key: 'notifications.text.VIDEO_PROCESSED',
      params: { title: 'Trip' },
      link: ['/v', 'v1'],
      icon: 'ready',
    });
  });

  it('support: an answer opens the ticket in the panel, a new ticket the admin card', () => {
    const answer = describeNotification({
      ...base,
      type: 'SUPPORT_REPLY',
      payload: { ticketId: 't1', number: 12, subject: 'Upload', resolved: true, preview: '' },
    } as NotificationDto);
    expect(answer).toEqual({
      key: 'notifications.text.SUPPORT_REPLY_resolved',
      params: { number: 12, subject: 'Upload' },
      link: panelLink('support', 't1'),
      icon: 'message',
    });
    const ticket = describeNotification({
      ...base,
      type: 'SUPPORT_TICKET',
      payload: {
        ticketId: 't1',
        number: 12,
        subject: 'Upload',
        fromUsername: 'ann',
        created: false,
      },
    } as NotificationDto);
    expect(ticket.key).toBe('notifications.text.SUPPORT_TICKET_reply');
    expect(ticket.params).toEqual({ number: 12, subject: 'Upload', name: 'ann' });
    expect(ticket.link).toEqual(['/admin/support', 't1']);
  });

  it('temporary links: opened (by someone or a guest) and saved lead to “My links”', () => {
    const opened = describeNotification({
      ...base,
      type: 'LINK_OPENED',
      payload: { linkId: 'l1', count: 3, title: 'Lake', fromUsername: 'bob', fromName: 'Bob' },
    } as NotificationDto);
    expect(opened).toEqual({
      key: 'notifications.text.LINK_OPENED',
      params: { name: 'bob', title: 'Lake', count: 3 },
      link: panelLink('links'),
      icon: 'social',
    });
    const guest = describeNotification({
      ...base,
      type: 'LINK_OPENED',
      payload: { linkId: 'l1', count: 1, title: 'Lake', fromUsername: null },
    } as NotificationDto);
    expect(guest.key).toBe('notifications.text.LINK_OPENED_guest');
    const saved = describeNotification({
      ...base,
      type: 'LINK_SAVED',
      payload: { linkId: 'l1', userId: 'u2', fromUsername: 'bob', count: 2, title: 'Lake' },
    } as NotificationDto);
    expect(saved).toMatchObject({
      key: 'notifications.text.LINK_SAVED',
      params: { name: 'bob', title: 'Lake', count: 2 },
      link: panelLink('links'),
    });
  });

  it('a video an admin edited links to the video', () => {
    const view = describeNotification({
      ...base,
      type: 'VIDEO_EDITED',
      payload: { videoId: 'v1', videoCode: 'abc', title: 'Trip' },
    } as NotificationDto);
    expect(view.key).toBe('notifications.text.VIDEO_EDITED');
    expect(view.params).toEqual({ title: 'Trip' });
    expect(view.link).toEqual(['/abc']);
  });

  it('a failed edit leads back to the editor', () => {
    const view = describeNotification({
      ...base,
      type: 'VIDEO_EDIT_FAILED',
      payload: { videoId: 'v1', videoCode: 'abc', title: 'Trip' },
    } as NotificationDto);
    expect(view.key).toBe('notifications.text.VIDEO_EDIT_FAILED');
    expect(view.link).toEqual(['/edit', 'v1']);
    expect(view.icon).toBe('failed');
  });

  it('removed videos have no link and carry the author', () => {
    const view = describeNotification({
      ...base,
      type: 'VIDEO_REMOVED',
      payload: { videoId: 'v1', title: 'Trip', authorName: 'Ann' },
    } as NotificationDto);
    expect(view.link).toBeNull();
    expect(view.params).toEqual({ title: 'Trip', author: 'Ann' });
  });

  it('an author or a party known by an anonymous link without a name is "Anonymous"', () => {
    const removed = describeNotification({
      ...base,
      type: 'VIDEO_REMOVED',
      payload: { videoId: 'v1', title: 'Trip', authorName: '', anonymous: true },
    } as NotificationDto);
    expect(removed.params).toEqual({ title: 'Trip', author: 'common.anonymous' });
    expect(removed.keyParams).toEqual(['author']);
    const shared = describeNotification({
      ...base,
      type: 'REQUEST_SHARED',
      payload: { requestId: 'r1', fromName: '', anonymous: true, count: 1, title: 'Trip' },
    } as NotificationDto);
    expect(shared.params['name']).toBe('common.anonymous');
    expect(shared.keyParams).toEqual(['name']);
    const named = describeNotification({
      ...base,
      type: 'REQUEST_SHARED',
      payload: { requestId: 'r1', fromName: 'Moth', count: 1, title: 'Trip' },
    } as NotificationDto);
    expect(named.params['name']).toBe('Moth');
  });

  it('falls back for unknown types and missing payloads', () => {
    const view = describeNotification({
      ...base,
      type: 'SOMETHING_NEW',
      payload: {},
    } as unknown as NotificationDto);
    expect(view.key).toBe('notifications.text.generic');
  });
  it('social notifications lead to the person, new videos to the author’s copy', () => {
    const follower = describeNotification({
      ...base,
      type: 'NEW_FOLLOWER',
      payload: { userId: 'u2', fromName: 'Bob', fromUsername: 'bob' },
    } as NotificationDto);
    expect(follower).toMatchObject({
      params: { name: 'Bob' },
      link: ['/@bob'],
      icon: 'social',
    });
    const video = describeNotification({
      ...base,
      type: 'FOLLOWED_NEW_VIDEO',
      payload: {
        videoId: 'v9',
        videoCode: 'k3x9ab2',
        title: 'Lake',
        authorName: 'Ann',
        authorUsername: 'ann',
        private: true,
      },
    } as NotificationDto);
    expect(video).toMatchObject({
      key: 'notifications.text.FOLLOWED_NEW_VIDEO_private',
      link: ['/k3x9ab2'],
    });
  });

  it('chat notifications open the conversation and fold several messages', () => {
    const one = describeNotification({
      ...base,
      type: 'NEW_MESSAGE',
      payload: { fromName: 'Bob', fromUsername: 'bob', preview: 'hi', hasVideo: false, count: 1 },
    } as NotificationDto);
    expect(one).toMatchObject({
      key: 'notifications.text.NEW_MESSAGE',
      link: panelLink('messages', 'bob'),
    });
    const video = describeNotification({
      ...base,
      type: 'NEW_MESSAGE',
      payload: { fromName: 'Bob', fromUsername: 'bob', preview: '', hasVideo: true, count: 1 },
    } as NotificationDto);
    expect(video.key).toBe('notifications.text.NEW_MESSAGE_video');
    const many = describeNotification({
      ...base,
      type: 'NEW_MESSAGE',
      payload: { fromName: 'Bob', fromUsername: 'bob', preview: 'x', count: 3 },
    } as NotificationDto);
    expect(many).toMatchObject({
      key: 'notifications.text.NEW_MESSAGE_many',
      params: { count: 3 },
    });
  });

  it('report outcomes and admin notices carry their text; a closed account has its own wording', () => {
    const resolved = describeNotification({
      ...base,
      type: 'REPORT_RESOLVED',
      payload: { reportId: 'p', outcome: 'noViolation', targetType: 'VIDEO', title: 'Lake' },
    } as NotificationDto);
    expect(resolved).toMatchObject({
      key: 'notifications.text.REPORT_RESOLVED_none',
      params: { title: 'Lake' },
      link: null,
      icon: 'admin',
    });
    const notice = describeNotification({
      ...base,
      type: 'ADMIN_NOTICE',
      payload: { message: 'Hello' },
    } as NotificationDto);
    expect(notice).toMatchObject({ params: { message: 'Hello' }, icon: 'admin' });
    const closed = describeNotification({
      ...base,
      type: 'REQUEST_INVALIDATED',
      payload: { requestId: 'r', reason: 'accountClosed', title: 'Trip' },
    } as NotificationDto);
    expect(closed.key).toBe('notifications.text.REQUEST_INVALIDATED_closed');
  });

  it('a failed video leads to the own shelf, where the tile says why', () => {
    const failed = describeNotification({
      ...base,
      type: 'VIDEO_FAILED',
      payload: { videoId: 'v', title: 'Lake', reason: 'unsupported' },
    } as NotificationDto);
    expect(failed).toMatchObject({ link: ['/'], icon: 'failed' });
  });

  it('a request or an offer with a message quotes it; without one the plain wording', () => {
    const asked = describeNotification({
      ...base,
      type: 'REQUEST_RECEIVED',
      payload: { requestId: 'r', fromName: 'Bob', count: 2, title: 'Trip', message: 'Swap?' },
    } as NotificationDto);
    expect(asked).toMatchObject({
      key: 'notifications.text.REQUEST_RECEIVED_message',
      params: { name: 'Bob', title: 'Trip', count: 2, message: 'Swap?' },
    });
    const offered = describeNotification({
      ...base,
      type: 'OFFER_RECEIVED',
      payload: { requestId: 'r', fromName: 'Bob', round: 1, message: null },
    } as NotificationDto);
    expect(offered.key).toBe('notifications.text.OFFER_RECEIVED');
  });

  it('plan reminders and the end of Pro lead to the plan settings', () => {
    const expiring = describeNotification({
      ...base,
      type: 'PLAN_EXPIRING',
      payload: { until: '2026-11-14T09:30:00.000Z' },
    } as NotificationDto);
    expect(expiring.key).toBe('notifications.text.PLAN_EXPIRING');
    expect(expiring.params['date']).toContain('2026');
    expect(expiring.link).toEqual(panelLink('settings', 'plan'));
    const over = describeNotification({
      ...base,
      type: 'PLAN_EXPIRED',
      payload: { maxFileBytes: 2 * 1024 ** 3, storageQuotaBytes: 30 * 1024 ** 3, overQuota: true },
    } as NotificationDto);
    expect(over).toMatchObject({
      key: 'notifications.text.PLAN_EXPIRED_over',
      params: { file: '2.0 GB', shelf: '30.0 GB' },
      link: panelLink('settings', 'plan'),
    });
  });

  it('says a hidden page opens with the end of Pro', () => {
    const soon = describeNotification({
      ...base,
      type: 'PLAN_EXPIRING',
      payload: { until: '2026-11-14T09:30:00.000Z', pageHidden: true },
    } as NotificationDto);
    expect(soon.key).toBe('notifications.text.PLAN_EXPIRING_page');
    const ended = describeNotification({
      ...base,
      type: 'PLAN_EXPIRED',
      payload: {
        maxFileBytes: 1,
        storageQuotaBytes: 1,
        overQuota: true,
        pageReopened: true,
      },
    } as NotificationDto);
    expect(ended.key).toBe('notifications.text.PLAN_EXPIRED_over_page');
  });

  it('says anonymous links stop opening with the end of Pro', () => {
    const soon = describeNotification({
      ...base,
      type: 'PLAN_EXPIRING',
      payload: { until: '2026-11-14T09:30:00.000Z', pageHidden: true, anonymousLinks: true },
    } as NotificationDto);
    expect(soon.key).toBe('notifications.text.PLAN_EXPIRING_page_links');
    const ended = describeNotification({
      ...base,
      type: 'PLAN_EXPIRED',
      payload: { maxFileBytes: 1, storageQuotaBytes: 1, overQuota: false, anonymousLinks: true },
    } as NotificationDto);
    expect(ended.key).toBe('notifications.text.PLAN_EXPIRED_links');
  });

  it('a removal by an admin carries the rule as a key and the moderator’s note when there is one', () => {
    const view = describeNotification({
      ...base,
      type: 'VIDEO_TAKEN_DOWN',
      payload: { videoId: 'v', title: 'Lake', rule: 'COPYRIGHT', message: 'Not yours.' },
    } as NotificationDto);
    expect(view).toMatchObject({
      key: 'notifications.text.VIDEO_TAKEN_DOWN_note',
      params: { title: 'Lake', rule: 'reports.reason.COPYRIGHT', message: 'Not yours.' },
      keyParams: ['rule'],
      link: null,
    });
    const odd = describeNotification({
      ...base,
      type: 'VIDEO_TAKEN_DOWN',
      payload: { videoId: 'v', title: 'Lake', rule: 'weird', message: null },
    } as NotificationDto);
    expect(odd.key).toBe('notifications.text.VIDEO_TAKEN_DOWN');
    expect(odd.params['rule']).toBe('reports.reason.OTHER');
  });

  it('an offer says what it gives for what; a refusal says when to ask again; what came opens the received', () => {
    const offer = describeNotification({
      ...base,
      type: 'OFFER_RECEIVED',
      payload: {
        requestId: 'r',
        fromName: 'Bob',
        round: 1,
        message: 'Deal?',
        gives: 'Lake',
        givesMore: 1,
        wants: 'Trip',
        wantsMore: 0,
      },
    } as NotificationDto);
    expect(offer).toMatchObject({
      key: 'notifications.text.OFFER_RECEIVED_deal_message',
      params: { gives: 'Lake', givesMore: 1, wants: 'Trip', wantsMore: 0, message: 'Deal?' },
      link: panelLink('exchange', 'r'),
    });
    const declined = describeNotification({
      ...base,
      type: 'REQUEST_DECLINED',
      payload: { requestId: 'r', fromName: 'Ann', comment: null, title: 'Trip', cooldownDays: 7 },
    } as NotificationDto);
    expect(declined).toMatchObject({
      key: 'notifications.text.REQUEST_DECLINED_again',
      params: { days: 7 },
    });
    const toHolder = describeNotification({
      ...base,
      type: 'REQUEST_DECLINED',
      payload: { requestId: 'r', fromName: 'Bob', comment: null, title: 'Trip' },
    } as NotificationDto);
    expect(toHolder.key).toBe('notifications.text.REQUEST_DECLINED');
    for (const type of ['REQUEST_SHARED', 'EXCHANGE_COMPLETED'] as const) {
      const done = describeNotification({
        ...base,
        type,
        payload: {
          requestId: 'r',
          fromName: 'Ann',
          withName: 'Ann',
          count: 1,
          title: 'T',
          received: 2,
          given: 1,
        },
      } as NotificationDto);
      expect(done).toMatchObject({ link: ['/'], query: { folder: 'others' }, icon: 'ready' });
    }
  });

  it('a request with an offer from the start says how much is offered', () => {
    const view = describeNotification({
      ...base,
      type: 'REQUEST_RECEIVED',
      payload: { requestId: 'r', fromName: 'Bob', count: 1, title: 'Trip', offered: 2 },
    } as NotificationDto);
    expect(view).toMatchObject({
      key: 'notifications.text.REQUEST_RECEIVED_offer',
      params: { offered: 2 },
    });
  });
});
