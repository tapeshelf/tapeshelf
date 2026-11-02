import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService, provideTransloco } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../api';
import type { MeDto } from '../../api/models/me-dto';
import { AuthStore } from '../auth/auth.store';
import { TranslocoHttpLoader } from '../i18n/transloco-loader';
import { AdminDictionary } from './admin-dictionary.service';
import { ViewAsService } from './view-as.service';

/** The admin panel's texts come from the API, and only an admin asks for them. */
describe('AdminDictionary', () => {
  let http: HttpTestingController;
  let transloco: TranslocoService;
  let auth: AuthStore;
  const viewAs = signal(false);

  beforeEach(async () => {
    viewAs.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTransloco({
          config: { availableLangs: ['en', 'ru'], defaultLang: 'en' },
          loader: TranslocoHttpLoader,
        }),
        { provide: Api, useValue: { invoke: vi.fn() } },
        { provide: ViewAsService, useValue: { active: viewAs } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    transloco = TestBed.inject(TranslocoService);
    auth = TestBed.inject(AuthStore);
    const main = firstValueFrom(transloco.load('en'));
    http.expectOne('/i18n/en.json').flush({ common: { save: 'Save' } });
    await main;
  });

  afterEach(() => http.verify());

  it('an ordinary user never asks for the admin texts', async () => {
    auth.setUser({ id: 'u1', username: 'ann', role: 'USER' } as MeDto);
    const dictionary = TestBed.inject(AdminDictionary);
    TestBed.tick();
    await dictionary.init();
    http.expectNone((r) => r.url.startsWith('/api/admin/'));
  });

  it('an admin gets them from the API, under admin.*, next to the public ones', async () => {
    auth.setUser({ id: 'u1', username: 'root', role: 'ADMIN' } as MeDto);
    const dictionary = TestBed.inject(AdminDictionary);
    const ready = dictionary.init();
    http.expectOne('/api/admin/i18n/en').flush({ done: 'Done.' });
    await ready;
    TestBed.tick(); // the effect finds the language already in: no second request
    expect(transloco.translate('admin.done')).toBe('Done.');
    expect(transloco.translate('common.save')).toBe('Save');
  });

  it('while an admin views the site as someone else, the texts still come', async () => {
    auth.setUser({ id: 'u2', username: 'ann', role: 'USER' } as MeDto);
    viewAs.set(true);
    const dictionary = TestBed.inject(AdminDictionary);
    const ready = dictionary.init();
    http.expectOne('/api/admin/i18n/en').flush({ done: 'Done.' });
    await ready;
    expect(transloco.translate('admin.done')).toBe('Done.');
  });
});
