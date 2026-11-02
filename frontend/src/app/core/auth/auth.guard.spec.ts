import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Api } from '../../api/api';
import { AdminDictionary } from '../admin/admin-dictionary.service';
import { adminGuard, homeGuard } from './auth.guard';
import { AuthStore } from './auth.store';

@Component({ template: '' })
class Blank {}

async function setup(user: { username: string } | null): Promise<Router> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: Blank, canActivate: [homeGuard] },
        { path: '@ann', component: Blank },
        { path: 'exchange', component: Blank, outlet: 'panel' },
        { path: 'settings', component: Blank, outlet: 'panel' },
      ]),
      { provide: AuthStore, useValue: { ready: () => Promise.resolve(), user: signal(user) } },
    ],
  });
  return TestBed.inject(Router);
}

describe('homeGuard', () => {
  it('sends a signed-in user to their page with the query, closing the panel of the page left', async () => {
    const router = await setup({ username: 'ann' });
    await router.navigateByUrl('/@ann(panel:exchange)');
    await router.navigate(['/'], { queryParams: { folder: 'others' } });
    expect(router.url).toBe('/@ann?folder=others');
  });

  it('keeps a panel the address itself asks for', async () => {
    const router = await setup({ username: 'ann' });
    await router.navigateByUrl('/(panel:settings)');
    expect(router.url).toBe('/@ann(panel:settings)');
  });

  it('lets a guest see the landing', async () => {
    const router = await setup(null);
    await router.navigateByUrl('/?x=1');
    expect(router.url).toBe('/?x=1');
  });
});

/** The admin panel needs two-step sign-in passed in this session. */
describe('adminGuard', () => {
  async function landing(
    step: { enabled: boolean; sessionConfirmed: boolean } | null,
  ): Promise<string> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin', component: Blank, canActivate: [adminGuard] },
          { path: 'settings/security', component: Blank },
        ]),
        { provide: AuthStore, useValue: { ready: () => Promise.resolve(), isAdmin: () => true } },
        { provide: AdminDictionary, useValue: { ensure: () => Promise.resolve() } },
        {
          provide: Api,
          useValue: {
            invoke: () => (step ? Promise.resolve(step) : Promise.reject(new Error('offline'))),
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin');
    return router.url;
  }

  it('opens for a session past the second step', async () => {
    expect(await landing({ enabled: true, sessionConfirmed: true })).toBe('/admin');
  });

  it('sends an admin without it, or not past it in this session, to the security settings', async () => {
    expect(await landing({ enabled: false, sessionConfirmed: false })).toBe('/settings/security');
    TestBed.resetTestingModule();
    expect(await landing({ enabled: true, sessionConfirmed: false })).toBe('/settings/security');
  });

  it('opens when the state cannot be read: the panel’s own requests say what is wrong', async () => {
    expect(await landing(null)).toBe('/admin');
  });
});
