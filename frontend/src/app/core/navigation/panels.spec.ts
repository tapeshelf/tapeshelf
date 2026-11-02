import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthStore } from '../auth/auth.store';
import { CLOSE_PANEL, PANEL_OUTLET, intoPanel, panelLink, panelOver } from './panels';

@Component({ template: '' })
class Blank {}

describe('side panel links', () => {
  async function setUp(user: { username: string } | null): Promise<Router> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { user: signal(user) } },
        provideRouter([
          { path: 'login', component: Blank },
          { path: 'a', component: Blank },
          { path: ':user', component: Blank },
          { path: 'settings/:tab', outlet: PANEL_OUTLET, component: Blank },
          { path: 'settings/:tab', pathMatch: 'full', redirectTo: intoPanel() },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/a');
    return router;
  }

  it('opens and closes the panel without touching the page under it', async () => {
    const router = await setUp(null);
    const open = router.createUrlTree(panelLink('settings', 'plan'));
    expect(router.serializeUrl(open)).toBe('/a(panel:settings/plan)');
    await router.navigateByUrl(open);
    expect(router.serializeUrl(router.createUrlTree(CLOSE_PANEL))).toBe('/a');
    expect(router.serializeUrl(router.createUrlTree(panelOver('ann', 'friends', 'ann')))).toBe(
      '/@ann(panel:friends/ann)',
    );
  });

  it('sends an old page address to the panel over the own shelf, a guest to sign in first', async () => {
    const router = await setUp({ username: 'ann' });
    await router.navigateByUrl('/settings/plan?x=1');
    expect(router.url).toBe('/@ann(panel:settings/plan)?x=1');
    const guest = await setUp(null);
    await guest.navigateByUrl('/settings/plan');
    expect(guest.url).toBe('/login?returnTo=%2Fsettings%2Fplan');
  });
});
