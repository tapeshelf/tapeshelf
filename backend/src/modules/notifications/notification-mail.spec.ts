import { ACTIVE_NOTIFICATION_TYPES } from './notification.types.js';
import { renderNotificationMail } from './notification-mail.js';

const PAYLOADS: Record<string, Record<string, unknown>> = {
  NEW_FOLLOWER: { userId: 'u2', fromName: 'Bob', fromUsername: 'bob' },
  FRIEND_ACCEPTED: { userId: 'u2', withName: 'Ann', withUsername: 'ann' },
  FOLLOWED_NEW_VIDEO: {
    videoId: 'v9',
    videoCode: 'k3x9ab2',
    title: 'Lake',
    authorName: 'Ann',
    authorUsername: 'ann',
    private: true,
  },
  NEW_MESSAGE: {
    conversationId: 'c1',
    fromUserId: 'u2',
    fromName: 'Bob',
    fromUsername: 'bob',
    preview: 'Have you seen the lake video?',
    hasVideo: false,
    count: 2,
  },
  REQUEST_RECEIVED: {
    requestId: 'r1',
    fromName: 'Bob',
    fromUsername: 'bob',
    count: 2,
    title: 'Trip',
  },
  OFFER_RECEIVED: { requestId: 'r1', fromName: 'Bob', round: 1 },
  REQUEST_SHARED: { requestId: 'r1', fromName: 'Ann', count: 1, title: 'Trip' },
  EXCHANGE_COMPLETED: {
    requestId: 'r1',
    withName: 'Ann',
    received: 1,
    given: 2,
  },
  REQUEST_DECLINED: {
    requestId: 'r1',
    fromName: 'Ann',
    comment: 'Not this one.',
    title: 'Trip',
  },
  REQUEST_CANCELLED: { requestId: 'r1', fromName: 'Bob', title: 'Trip' },
  REQUEST_INVALIDATED: { requestId: 'r1', reason: 'videoLost', title: 'Trip' },
  VIDEO_PROCESSED: {
    videoId: '0199d1c0-0000-7000-8000-000000000001',
    title: 'Holiday 2026',
  },
  VIDEO_FAILED: {
    videoId: '0199d1c0-0000-7000-8000-000000000002',
    title: 'Broken clip',
    reason: 'corrupted',
  },
  VIDEO_REMOVED: {
    videoId: '0199d1c0-0000-7000-8000-000000000003',
    title: 'Shared clip',
    authorName: 'Ann',
  },
  REPORT_RESOLVED: {
    reportId: 'p1',
    outcome: 'actionTaken',
    targetType: 'VIDEO',
    title: 'Spam reel',
  },
  ADMIN_NOTICE: {
    message: 'Please add a description to your videos <b>soon</b>.',
  },
  VIDEO_TAKEN_DOWN: {
    videoId: '0199d1c0-0000-7000-8000-000000000004',
    title: 'Lake',
    rule: 'COPYRIGHT',
    message: null,
  },
  VIDEO_EDITED: {
    videoId: '0199d1c0-0000-7000-8000-000000000005',
    videoCode: 'k3x9ab2',
    title: 'Lake',
  },
  VIDEO_EDIT_FAILED: {
    videoId: '0199d1c0-0000-7000-8000-000000000005',
    videoCode: 'k3x9ab2',
    title: 'Lake',
  },
  SUPPORT_REPLY: {
    ticketId: '0199d1c0-0000-7000-8000-000000000007',
    number: 12,
    subject: 'Upload stops at 99 %',
    resolved: false,
    preview: 'Thanks! Please try once more: we fixed it.',
  },
  SUPPORT_TICKET: {
    ticketId: '0199d1c0-0000-7000-8000-000000000007',
    number: 12,
    subject: 'Upload stops at 99 %',
    topic: 'BUG',
    fromUsername: 'ann',
    created: true,
    preview: 'My upload stops at 99 % every time.',
  },
  LINK_OPENED: {
    linkId: 'l1',
    count: 3,
    title: 'Lake',
    fromName: 'Bob',
    fromUsername: 'bob',
  },
  LINK_SAVED: {
    linkId: 'l1',
    userId: 'u2',
    fromName: 'Bob',
    fromUsername: 'bob',
    count: 1,
    title: 'Lake',
  },
  PLAN_EXPIRING: { until: '2026-11-14T09:30:00.000Z' },
  PLAN_PAYMENT_FAILED: { until: '2026-11-21T09:30:00.000Z' },
  PLAN_EXPIRED: {
    maxFileBytes: 2 * 1024 ** 3,
    storageQuotaBytes: 30 * 1024 ** 3,
    overQuota: false,
  },
  TRAFFIC_RUNNING_OUT: {
    usedBytes: 41 * 1024 ** 3,
    limitBytes: 50 * 1024 ** 3,
    resetAt: '2026-12-01T00:00:00.000Z',
  },
  TRAFFIC_USED_UP: {
    limitBytes: 50 * 1024 ** 3,
    resetAt: '2026-12-01T00:00:00.000Z',
  },
};

describe('renderNotificationMail', () => {
  for (const locale of ['en', 'ru']) {
    for (const type of ACTIVE_NOTIFICATION_TYPES) {
      it(`renders ${type} in ${locale}`, () => {
        const mail = renderNotificationMail(locale, type, PAYLOADS[type]!, {
          publicUrl: 'https://tapeshelf.test',
          username: 'ann',
        });
        expect(mail).not.toBeNull();
        expect(mail!.subject).not.toMatch(/mail\.notifications/);
        expect(mail!.text).toContain(
          'https://tapeshelf.test/settings/notifications',
        );
        expect(mail!.text).toMatchSnapshot();
      });
    }
  }

  it('picks the variant: report outcome and target, request closed with an account', () => {
    const links = { publicUrl: 'https://x', username: 'ann' };
    const none = renderNotificationMail(
      'en',
      'REPORT_RESOLVED',
      {
        reportId: 'p',
        outcome: 'noViolation',
        targetType: 'USER',
        title: 'Bob',
      },
      links,
    );
    expect(none!.text).toContain('report about Bob and found no violation');
    const closed = renderNotificationMail(
      'ru',
      'REQUEST_INVALIDATED',
      { requestId: 'r', reason: 'accountClosed', title: 'Trip' },
      links,
    );
    expect(closed!.text).toContain('второй аккаунт больше недоступен');
  });

  it('tells an expired Pro over the Free quota that uploads are paused', () => {
    const mail = renderNotificationMail(
      'en',
      'PLAN_EXPIRED',
      {
        maxFileBytes: 2 * 1024 ** 3,
        storageQuotaBytes: 30 * 1024 ** 3,
        overQuota: true,
      },
      { publicUrl: 'https://x', username: 'ann' },
    );
    expect(mail!.text).toContain('new uploads are paused');
    expect(mail!.text).toContain('30.0 GiB in total');
    expect(mail!.text).toContain('https://x/settings/plan');
  });

  it('says a hidden page opens with the end of Pro, before and after', () => {
    const links = { publicUrl: 'https://x', username: 'ann' };
    const soon = renderNotificationMail(
      'ru',
      'PLAN_EXPIRING',
      { until: '2026-11-14T09:30:00.000Z', pageHidden: true },
      links,
    );
    expect(soon!.text).toContain(
      'когда Pro закончится, она снова станет видна',
    );
    const plain = renderNotificationMail(
      'ru',
      'PLAN_EXPIRING',
      { until: '2026-11-14T09:30:00.000Z' },
      links,
    );
    expect(plain!.text).not.toContain('страница');
    const ended = renderNotificationMail(
      'en',
      'PLAN_EXPIRED',
      {
        maxFileBytes: 2 * 1024 ** 3,
        storageQuotaBytes: 30 * 1024 ** 3,
        overQuota: false,
        pageReopened: true,
      },
      links,
    );
    expect(ended!.text).toContain('Your page is visible to everyone again');
  });

  it('a removal names the rule, adds the moderator’s note and where to object', () => {
    const mail = renderNotificationMail(
      'ru',
      'VIDEO_TAKEN_DOWN',
      {
        videoId: 'v',
        title: 'Озеро',
        rule: 'UNMARKED_ADULT',
        message: 'Отметьте как чувствительное и загрузите снова.',
      },
      {
        publicUrl: 'https://x',
        username: 'ann',
        contactEmail: 'contact@example.test',
      },
    );
    expect(mail!.subject).toBe('Ваше видео «Озеро» удалено');
    expect(mail!.text).toContain('чувствительный контент без отметки');
    expect(mail!.text).toContain(
      'Комментарий модератора: Отметьте как чувствительное и загрузите снова.',
    );
    expect(mail!.text).toContain('напишите на contact@example.test');
    expect(mail!.html).toContain('contact@example.test');
    const bare = renderNotificationMail(
      'en',
      'VIDEO_TAKEN_DOWN',
      { videoId: 'v', title: 'Lake', rule: 'weird', message: null },
      { publicUrl: 'https://x', username: 'ann' },
    );
    expect(bare!.text).toContain('a breach of the rules');
    expect(bare!.text).not.toContain('write to');
  });

  it('quotes the message of a request and of an offer, escaped in HTML', () => {
    const links = { publicUrl: 'https://x', username: 'ann' };
    const request = renderNotificationMail(
      'en',
      'REQUEST_RECEIVED',
      {
        ...PAYLOADS.REQUEST_RECEIVED!,
        message: 'Swap for my <b>lake</b> clip?',
      },
      links,
    );
    expect(request!.text).toContain(
      'Their message: “Swap for my <b>lake</b> clip?”',
    );
    expect(request!.html).toContain(
      'Swap for my &lt;b&gt;lake&lt;/b&gt; clip?',
    );
    const offer = renderNotificationMail(
      'ru',
      'OFFER_RECEIVED',
      { ...PAYLOADS.OFFER_RECEIVED!, message: 'Давай так' },
      links,
    );
    expect(offer!.text).toContain('Сообщение: «Давай так»');
    // Without a message nothing is added.
    expect(
      renderNotificationMail(
        'en',
        'REQUEST_RECEIVED',
        PAYLOADS.REQUEST_RECEIVED!,
        links,
      )!.text,
    ).not.toContain('Their message');
  });

  it('an offer says what for what; a refusal says when to ask again', () => {
    const links = { publicUrl: 'https://x', username: 'ann' };
    const offer = renderNotificationMail(
      'ru',
      'OFFER_RECEIVED',
      {
        ...PAYLOADS.OFFER_RECEIVED!,
        gives: 'Озеро',
        givesMore: 2,
        wants: 'Поход',
        wantsMore: 0,
      },
      links,
    );
    expect(offer!.text).toContain(
      'Bob предлагает «Озеро» и ещё 2 за ваше «Поход».',
    );
    const again = (days: number | undefined) =>
      renderNotificationMail(
        'ru',
        'REQUEST_DECLINED',
        { ...PAYLOADS.REQUEST_DECLINED!, cooldownDays: days },
        links,
      )!.text;
    expect(again(5)).toContain('Попросить снова можно через 5 дней.');
    expect(again(1)).toContain('через 1 день.');
    expect(again(0)).not.toContain('Попросить снова');
    expect(again(undefined)).not.toContain('Попросить снова');
  });

  it('a request that offers something in return says so first', () => {
    const links = { publicUrl: 'https://x', username: 'ann' };
    const mail = renderNotificationMail(
      'ru',
      'REQUEST_RECEIVED',
      { ...PAYLOADS.REQUEST_RECEIVED!, offered: 2, message: 'Меняемся?' },
      links,
    );
    const text = mail!.text;
    expect(text).toContain('Взамен предлагает 2 своих видео.');
    expect(text.indexOf('Взамен')).toBeLessThan(text.indexOf('Меняемся?'));
    expect(
      renderNotificationMail(
        'en',
        'REQUEST_RECEIVED',
        PAYLOADS.REQUEST_RECEIVED!,
        links,
      )!.text,
    ).not.toContain('In return');
  });

  it('escapes the admin message in HTML', () => {
    const mail = renderNotificationMail(
      'en',
      'ADMIN_NOTICE',
      { message: '<script>x</script>' },
      { publicUrl: 'https://x', username: 'ann' },
    );
    expect(mail!.html).not.toContain('<script>');
    expect(mail!.html).toContain('&lt;script&gt;');
  });

  it('support: a ticket marked solved without words, and the author writing again', () => {
    const links = { publicUrl: 'https://x', username: 'ann' };
    const solved = renderNotificationMail(
      'en',
      'SUPPORT_REPLY',
      { ...PAYLOADS.SUPPORT_REPLY!, resolved: true, preview: '' },
      links,
    )!;
    expect(solved.text).toContain('marked your request #12');
    expect(solved.text).toContain(
      'https://x/support/0199d1c0-0000-7000-8000-000000000007',
    );
    const again = renderNotificationMail(
      'ru',
      'SUPPORT_TICKET',
      { ...PAYLOADS.SUPPORT_TICKET!, created: false },
      links,
    )!;
    expect(again.text).toContain('Новое сообщение от @ann в #12');
    expect(again.text).toContain(
      'https://x/admin/support/0199d1c0-0000-7000-8000-000000000007',
    );
  });

  it('a temporary link opened by a guest says “someone”', () => {
    for (const locale of ['en', 'ru']) {
      const mail = renderNotificationMail(
        locale,
        'LINK_OPENED',
        { linkId: 'l1', count: 1, title: 'Lake', fromUsername: null },
        { publicUrl: 'https://tapeshelf.test', username: 'ann' },
      );
      expect(mail!.text).not.toContain('@');
      expect(mail!.text).toContain('https://tapeshelf.test/links');
    }
  });

  it('maps unknown fail reasons', () => {
    const links = { publicUrl: 'https://x', username: 'ann' };
    const mail = renderNotificationMail(
      'en',
      'VIDEO_FAILED',
      { videoId: 'v', title: 'T', reason: 'weird' },
      links,
    );
    expect(mail!.text).toContain('Processing failed');
    expect(mail!.text).toContain('https://x/@ann');
  });
});
