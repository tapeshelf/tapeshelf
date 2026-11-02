import {
  type PolicyHolding,
  type PolicyVideo,
  type Viewer,
  canAddToCollection,
  canDownload,
  canEditVideo,
  canHide,
  canManage,
  canStream,
  canHidePage,
  canView,
  holdingVisibleTo,
  pageVisible,
  requestBlocker,
} from './access-policy.js';

const AUTHOR = 'author';
const guest: Viewer = null;
const user: Viewer = { id: 'user', role: 'USER', tier: 'BASIC' };
const author: Viewer = { id: AUTHOR, role: 'USER', tier: 'BASIC' };
const admin: Viewer = { id: 'admin', role: 'ADMIN', tier: 'BASIC' };

function video(over: Partial<PolicyVideo> = {}): PolicyVideo {
  return {
    id: 'v',
    authorId: AUTHOR,
    visibility: 'PRIVATE',
    status: 'READY',
    deletedAt: null,
    ...over,
  };
}
const holding = (
  holderId: string,
  over: Partial<PolicyHolding> = {},
): PolicyHolding => ({
  holderId,
  source: 'EXCHANGE',
  hidden: false,
  ...over,
});
const userHolds = holding('user');

describe('access policy', () => {
  describe('canView / canStream', () => {
    it.each<[string, Viewer, PolicyVideo, PolicyHolding | null, boolean]>([
      [
        'guest, public ready',
        guest,
        video({ visibility: 'PUBLIC' }),
        null,
        true,
      ],
      [
        'guest, public processing',
        guest,
        video({ visibility: 'PUBLIC', status: 'PROCESSING' }),
        null,
        false,
      ],
      ['guest, private', guest, video(), null, false],
      ['user, private, no holding', user, video(), null, false],
      ['user, private, holds by exchange', user, video(), userHolds, true],
      [
        'user, private, holds by bookmark',
        user,
        video(),
        holding('user', { source: 'PUBLIC_ADD' }),
        true,
      ],
      ['user, holding of someone else', user, video(), holding('other'), false],
      [
        'author, private processing',
        author,
        video({ status: 'PROCESSING' }),
        null,
        true,
      ],
      ['admin, anything', admin, video({ status: 'FAILED' }), null, true],
      [
        'author, deleted',
        author,
        video({ deletedAt: new Date() }),
        null,
        false,
      ],
      [
        'admin, deleted, files still in the trash',
        admin,
        video({ deletedAt: new Date(), purgedAt: null }),
        null,
        true,
      ],
      [
        'admin, deleted and erased',
        admin,
        video({ deletedAt: new Date(), purgedAt: new Date() }),
        null,
        false,
      ],
      [
        'admin, deleted, erase state not loaded',
        admin,
        video({ deletedAt: new Date() }),
        null,
        false,
      ],
      [
        'holder, deleted',
        user,
        video({ deletedAt: new Date(), purgedAt: null }),
        userHolds,
        false,
      ],
    ])('%s', (_name, viewer, v, h, expected) => {
      expect(canView(viewer, v, h)).toBe(expected);
    });

    it('streams only READY videos even for the author', () => {
      expect(canStream(author, video({ status: 'PROCESSING' }), null)).toBe(
        false,
      );
      expect(canStream(author, video(), null)).toBe(true);
      expect(canStream(guest, video({ visibility: 'PUBLIC' }), null)).toBe(
        true,
      );
    });
  });

  describe('canDownload', () => {
    it.each<[string, Viewer, PolicyVideo, PolicyHolding | null, boolean]>([
      ['guest, public', guest, video({ visibility: 'PUBLIC' }), null, false],
      [
        'signed in, public, no holding',
        user,
        video({ visibility: 'PUBLIC' }),
        null,
        true,
      ],
      ['author, private', author, video(), null, true],
      ['holder by exchange, private', user, video(), userHolds, true],
      [
        'bookmark of a video made private since',
        user,
        video(),
        holding('user', { source: 'PUBLIC_ADD' }),
        true,
      ],
      [
        'hidden holding',
        user,
        video(),
        holding('user', { hidden: true }),
        true,
      ],
      ['not a holder, private', user, video(), null, false],
      [
        'holder, still processing',
        user,
        video({ status: 'PROCESSING' }),
        userHolds,
        false,
      ],
      [
        'holder, deleted',
        user,
        video({ deletedAt: new Date() }),
        userHolds,
        false,
      ],
      ['admin, any private', admin, video(), null, true],
      [
        'admin, still processing',
        admin,
        video({ status: 'PROCESSING' }),
        null,
        false,
      ],
    ])('%s', (_, viewer, v, h, expected) => {
      expect(canDownload(viewer, v, h)).toBe(expected);
    });
  });

  describe('canAddToCollection', () => {
    it('registered viewer, public ready video, not the author, not held yet', () => {
      const pub = video({ visibility: 'PUBLIC' });
      expect(canAddToCollection(guest, pub, null)).toBe(false);
      expect(canAddToCollection(user, pub, null)).toBe(true);
      expect(canAddToCollection(admin, pub, null)).toBe(true);
      expect(canAddToCollection(author, pub, null)).toBe(false);
      expect(canAddToCollection(user, pub, userHolds)).toBe(false);
      expect(canAddToCollection(user, video(), null)).toBe(false);
      expect(
        canAddToCollection(
          user,
          video({ visibility: 'PUBLIC', status: 'QUEUED' }),
          null,
        ),
      ).toBe(false);
    });
  });

  describe('canManage / canHide', () => {
    it('author and admin manage; only non-author holders hide', () => {
      expect(canManage(author, video())).toBe(true);
      expect(canManage(admin, video())).toBe(true);
      expect(canManage(user, video())).toBe(false);
      expect(canManage(author, video({ deletedAt: new Date() }))).toBe(false);
      const trashed = video({ deletedAt: new Date(), purgedAt: null });
      expect(canManage(admin, trashed)).toBe(false);
      expect(canDownload(admin, trashed, null)).toBe(false);
      expect(canStream(admin, trashed, null)).toBe(true);
      expect(canHide(user, userHolds)).toBe(true);
      expect(canHide(user, holding('user', { source: 'PUBLIC_ADD' }))).toBe(
        true,
      );
      // "Only for me": the author hides their own video too.
      expect(canHide(author, holding(AUTHOR, { source: 'AUTHOR' }))).toBe(true);
      expect(canHide(user, holding('other'))).toBe(false);
      expect(canHide(guest, userHolds)).toBe(false);
    });
  });

  describe('holdingVisibleTo (someone else’s page)', () => {
    const page = (over: Partial<PolicyHolding> = {}) => holding('holder', over);
    it('hides hidden, unfinished and demoted bookmarks from visitors but not from the holder', () => {
      const holder: Viewer = { id: 'holder', role: 'USER', tier: 'BASIC' };
      expect(holdingVisibleTo(guest, video(), page())).toBe(true);
      expect(holdingVisibleTo(guest, video(), page({ hidden: true }))).toBe(
        false,
      );
      expect(holdingVisibleTo(holder, video(), page({ hidden: true }))).toBe(
        true,
      );
      expect(holdingVisibleTo(admin, video(), page({ hidden: true }))).toBe(
        true,
      );
      expect(
        holdingVisibleTo(guest, video({ status: 'PROCESSING' }), page()),
      ).toBe(false);
      expect(
        holdingVisibleTo(holder, video({ status: 'PROCESSING' }), page()),
      ).toBe(true);
      expect(
        holdingVisibleTo(
          guest,
          video({ visibility: 'PUBLIC' }),
          page({ source: 'PUBLIC_ADD' }),
        ),
      ).toBe(true);
      expect(
        holdingVisibleTo(guest, video(), page({ source: 'PUBLIC_ADD' })),
      ).toBe(false);
      expect(
        holdingVisibleTo(holder, video(), page({ source: 'PUBLIC_ADD' })),
      ).toBe(true);
      expect(
        holdingVisibleTo(holder, video({ deletedAt: new Date() }), page()),
      ).toBe(false);
    });
  });

  describe('requestBlocker', () => {
    const page = holding('holder');
    it('reports why the request button is not offered', () => {
      expect(requestBlocker(guest, video(), page, null)).toBe('guest');
      expect(
        requestBlocker(
          { id: 'holder', role: 'USER', tier: 'BASIC' },
          video(),
          page,
          null,
        ),
      ).toBe('ownPage');
      expect(
        requestBlocker(
          user,
          video({ visibility: 'PUBLIC' }),
          holding('holder', { source: 'PUBLIC_ADD' }),
          null,
        ),
      ).toBe('alreadyWatchable');
      expect(
        requestBlocker(
          user,
          video(),
          holding('holder', { source: 'PUBLIC_ADD' }),
          null,
        ),
      ).toBe('bookmark');
      expect(
        requestBlocker(user, video({ status: 'QUEUED' }), page, null),
      ).toBe('notReady');
      expect(
        requestBlocker(
          user,
          video(),
          holding('holder', { hidden: true }),
          null,
        ),
      ).toBe('hidden');
      expect(
        requestBlocker(user, video({ visibility: 'PUBLIC' }), page, null),
      ).toBe('alreadyWatchable');
      expect(requestBlocker(user, video(), page, userHolds)).toBe(
        'alreadyWatchable',
      );
      expect(requestBlocker(user, video(), page, null)).toBeNull();
    });
  });

  it('pages exist only for active accounts', () => {
    const owner = (status: 'ACTIVE' | 'BANNED' | 'DELETED') => ({
      id: AUTHOR,
      status,
      pageHidden: false,
    });
    expect(pageVisible(owner('ACTIVE'), guest)).toBe(true);
    expect(pageVisible(owner('BANNED'), guest)).toBe(false);
    expect(pageVisible(owner('BANNED'), admin)).toBe(false);
    expect(pageVisible(owner('DELETED'), author)).toBe(false);
  });

  it('a hidden page shows only to its owner and to admins', () => {
    const hidden = { id: AUTHOR, status: 'ACTIVE' as const, pageHidden: true };
    expect(pageVisible(hidden, guest)).toBe(false);
    expect(pageVisible(hidden, user)).toBe(false);
    expect(pageVisible(hidden, author)).toBe(true);
    expect(pageVisible(hidden, admin)).toBe(true);
  });

  it('Pro and admins may hide their page; on a self-hosted instance everyone', () => {
    const pro = { id: 'p', role: 'USER' as const, tier: 'PREMIUM' as const };
    expect(canHidePage(pro, true)).toBe(true);
    expect(canHidePage(admin!, true)).toBe(true);
    expect(canHidePage(user!, true)).toBe(false);
    expect(canHidePage(user!, false)).toBe(true);
  });

  describe('canEditVideo', () => {
    it('Pro authors their own ready videos, admins any; on a self-hosted instance every author', () => {
      const pro = {
        id: AUTHOR,
        role: 'USER' as const,
        tier: 'PREMIUM' as const,
      };
      const free = {
        id: AUTHOR,
        role: 'USER' as const,
        tier: 'BASIC' as const,
      };
      expect(canEditVideo(pro, video(), true)).toBe(true);
      expect(canEditVideo(free, video(), true)).toBe(false);
      expect(canEditVideo(free, video(), false)).toBe(true);
      expect(canEditVideo(admin, video(), true)).toBe(true);
      expect(canEditVideo({ ...pro, id: 'someone' }, video(), true)).toBe(
        false,
      );
      expect(canEditVideo(pro, video({ status: 'PROCESSING' }), true)).toBe(
        false,
      );
      expect(canEditVideo(pro, video({ deletedAt: new Date() }), true)).toBe(
        false,
      );
      expect(canEditVideo(guest, video(), false)).toBe(false);
    });
  });
});
