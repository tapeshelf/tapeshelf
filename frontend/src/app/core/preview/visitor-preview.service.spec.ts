import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthStore } from '../auth/auth.store';
import { PANEL_OUTLET } from '../navigation/panels';
import { VisitorPreview } from './visitor-preview.service';

@Component({ template: '' })
class Blank {}

describe('VisitorPreview', () => {
  const auth = {
    user: signal<{ username: string } | null>({ username: 'Owner' }),
    status: signal<'unknown' | 'authenticated' | 'anonymous'>('authenticated'),
  };
  let preview: VisitorPreview;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    auth.user.set({ username: 'Owner' });
    auth.status.set('authenticated');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { outlet: PANEL_OUTLET, path: 'settings', component: Blank },
          { path: '**', component: Blank },
        ]),
        { provide: AuthStore, useValue: auth },
      ],
    });
    preview = TestBed.inject(VisitorPreview);
    router = TestBed.inject(Router);
  });

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    TestBed.tick();
  }

  it('is in force on the own page and the videos opened from it, nowhere else', async () => {
    await go('/@owner');
    preview.start();
    expect(preview.active()).toBe(true);
    expect(preview.shown()).toBe(true);

    await go('/k7m2pqx'); // a video from the own page
    expect(preview.active()).toBe(true);

    await go('/@someone'); // another shelf: the owner's app as usual, no reminder
    expect(preview.active()).toBe(false);
    expect(preview.shown()).toBe(false);
    await go('/k7m2pqx'); // and a video opened from there
    expect(preview.active()).toBe(false);

    await go('/admin');
    expect(preview.active()).toBe(false);

    await go('/@Owner'); // back home: the mode was only waiting
    expect(preview.shown()).toBe(true);
  });

  it('keeps quiet while a panel is over the page, the page itself staying a guest view', async () => {
    await go('/@owner');
    preview.start();
    await go(`/@owner(${PANEL_OUTLET}:settings)`);
    expect(preview.active()).toBe(true);
    expect(preview.shown()).toBe(false);
    await go('/@owner');
    expect(preview.shown()).toBe(true);
  });

  it('ends on signing out, for the next sign-in too', async () => {
    await go('/@owner');
    preview.start();
    expect(sessionStorage.getItem('vs.visitorPreview')).toBe('1');
    auth.user.set(null);
    auth.status.set('anonymous');
    TestBed.tick();
    expect(preview.active()).toBe(false);
    expect(sessionStorage.getItem('vs.visitorPreview')).toBeNull();
    auth.user.set({ username: 'Owner' });
    auth.status.set('authenticated');
    TestBed.tick();
    expect(preview.active()).toBe(false);
  });
});
