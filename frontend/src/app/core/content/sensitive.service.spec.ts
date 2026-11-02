import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Api, type MeDto } from '../../api';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { AuthStore } from '../auth/auth.store';
import { SensitiveContentService } from './sensitive.service';

const ME = {
  id: 'u1',
  username: 'ann',
  displayName: 'Ann',
  showSensitive: false,
  locale: 'en',
  theme: 'LIGHT',
  role: 'USER',
  tier: 'BASIC',
} as unknown as MeDto;

describe('SensitiveContentService', () => {
  let invoked: unknown[];

  beforeEach(() => {
    localStorage.clear();
    invoked = [];
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: Api,
          useValue: {
            invoke: (_fn: unknown, params: { body: Partial<MeDto> }) => {
              invoked.push(params.body);
              return Promise.resolve({ ...ME, ...params.body });
            },
          },
        },
      ],
    });
  });

  it('remembers a guest in this browser and never asks again', async () => {
    const service = TestBed.inject(SensitiveContentService);
    expect(service.allowed()).toBe(false);
    expect(service.blurs({ sensitive: true })).toBe(true);
    expect(service.blurs({ sensitive: false })).toBe(false);

    await service.agree();
    expect(service.allowed()).toBe(true);
    expect(service.guestConsent()).toBe(true);
    expect(localStorage.getItem('vs.sensitive')).toBe('1');
    expect(invoked).toEqual([]);
    expect(await service.ensure()).toBe(true);
  });

  it('follows the account flag for a signed-in user and saves the agreement to it', async () => {
    localStorage.setItem('vs.sensitive', '1'); // an old browser agreement must not override the account
    const auth = TestBed.inject(AuthStore);
    auth.setUser(ME);
    const service = TestBed.inject(SensitiveContentService);
    expect(service.allowed()).toBe(false);

    await service.agree();
    expect(invoked).toEqual([{ showSensitive: true }]);
    expect(auth.user()?.showSensitive).toBe(true);
    expect(service.allowed()).toBe(true);
    // the author always sees their own
    auth.setUser({ ...ME, showSensitive: false });
    expect(service.blurs({ sensitive: true, author: { id: 'u1' } })).toBe(false);
    expect(service.blurs({ sensitive: true, author: { id: 'u2' } })).toBe(true);
  });
});
