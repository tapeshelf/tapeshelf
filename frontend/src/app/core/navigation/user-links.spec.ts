import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ActivatedRoute, Router, provideRouter } from '@angular/router';

import {
  atUser,
  byline,
  fromLegacyUserPath,
  holderOf,
  isAnonymous,
  nameless,
  profileLink,
  videoCodeMatcher,
  videoLink,
  videoState,
} from './user-links';

@Component({ template: '' })
class Blank {}

describe('user links', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { matcher: atUser(), component: Blank, data: { page: 'profile' } },
          { matcher: atUser('friends'), component: Blank, data: { page: 'friends' } },
          { matcher: atUser('v', ':videoId'), component: Blank, data: { page: 'old video' } },
          { path: 'u/:username', pathMatch: 'full', redirectTo: fromLegacyUserPath() },
          {
            path: 'u/:username/v/:videoId',
            pathMatch: 'full',
            redirectTo: fromLegacyUserPath('v', ':videoId'),
          },
          { path: 'about', component: Blank, data: { page: 'about' } },
          { matcher: videoCodeMatcher, component: Blank, data: { page: 'video' } },
          { path: '**', component: Blank, data: { page: 'none' } },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  function leaf(): ActivatedRoute {
    let r = router.routerState.root;
    while (r.firstChild) r = r.firstChild;
    return r;
  }

  it('builds /@ and /<code> links', () => {
    expect(router.serializeUrl(router.createUrlTree(profileLink('ann')))).toBe('/@ann');
    expect(router.serializeUrl(router.createUrlTree(videoLink('k3x9ab2')))).toBe('/k3x9ab2');
  });

  it('opens a video at its short code, in any case; page names and look-alikes are not codes', async () => {
    for (const code of ['k3x9ab2', 'K3X9AB2']) {
      await router.navigateByUrl(`/${code}`);
      expect(leaf().snapshot.data['page']).toBe('video');
      expect(leaf().snapshot.params).toEqual({ code });
    }
    await router.navigateByUrl('/about');
    expect(leaf().snapshot.data['page']).toBe('about');
    for (const url of ['/aboutus', '/k3x9ab0', '/k3x9ab', '/k3x9ab22', '/k3x9ab2/x']) {
      await router.navigateByUrl(url);
      expect(leaf().snapshot.data['page']).toBe('none');
    }
  });

  it('carries the holder in the navigation state', async () => {
    await router.navigateByUrl('/k3x9ab2', { state: videoState('bob') });
    expect(holderOf(router.lastSuccessfulNavigation()?.extras.state)).toBe('bob');
    await router.navigateByUrl('/k3x9ab3', { state: videoState(null) });
    expect(holderOf(router.lastSuccessfulNavigation()?.extras.state)).toBeNull();
  });

  it('matches /@username pages and captures params', async () => {
    await router.navigateByUrl('/@ann/v/v1');
    expect(leaf().snapshot.data['page']).toBe('old video');
    expect(leaf().snapshot.params).toEqual({ username: 'ann', videoId: 'v1' });
    await router.navigateByUrl('/@ann/friends?list=followers');
    expect(leaf().snapshot.data['page']).toBe('friends');
    await router.navigateByUrl('/@ann');
    expect(leaf().snapshot.data['page']).toBe('profile');
  });

  it('leaves anything else alone', async () => {
    for (const url of ['/ann', '/@', '/@ann/other', '/@ann/v', '/@a.b']) {
      await router.navigateByUrl(url);
      expect(leaf().snapshot.data['page']).toBe('none');
    }
  });

  it('redirects old /u/ links, query kept', async () => {
    await router.navigateByUrl('/u/ann/v/v1?t=5');
    expect(router.url).toBe('/@ann/v/v1?t=5');
    await router.navigateByUrl('/u/ann');
    expect(router.url).toBe('/@ann');
  });

  it('someone known by an anonymous link: their page is /p/<code>, never a nickname', () => {
    expect(profileLink('ann')).toEqual(['/@ann']);
    expect(profileLink('~k3x9ab2mqr')).toEqual(['/p', 'k3x9ab2mqr']);
    expect(isAnonymous('~k3x9ab2mqr')).toBe(true);
    expect(isAnonymous('~')).toBe(true);
    expect(isAnonymous('ann')).toBe(false);
    expect(byline({ username: 'ann', displayName: 'Ann' })).toBe('@ann');
    expect(byline({ username: '~k3x9ab2mqr', displayName: 'Moth' })).toBe('Moth');
    expect(byline({ username: '~', displayName: '' })).toBe('');
    expect(nameless({ username: '~' })).toBe('common.anonymous');
    expect(nameless({ username: 'gone' })).toBe('chat.deletedUser');
  });
});
