import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import {
  Api,
  type DeviceDto,
  type NotificationPreferenceDto,
  notificationsPreferences,
  notificationsUpdatePreferences,
  pushDevices,
} from '../../api';
import { SITE_FALLBACK, SiteConfig } from '../../core/site/site-config';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { NotificationSettingsPage } from './notification-settings';

const PREFS: NotificationPreferenceDto[] = [
  { type: 'REQUEST_RECEIVED', inApp: true, email: true, push: true },
  { type: 'NEW_FOLLOWER', inApp: true, email: false, push: false },
  { type: 'NEW_MESSAGE', inApp: true, email: true, push: true },
];
const PHONE = {
  id: 'd1',
  platform: 'android',
  push: true,
  client: 'android/0.1.0 (Pixel 8; Android 15)',
  current: false,
  createdAt: '2026-11-05T12:00:00.000Z',
} as DeviceDto;

describe('NotificationSettingsPage', () => {
  let devices: DeviceDto[];
  let saved: NotificationPreferenceDto[][];

  async function render(emailEnabled = true) {
    TestBed.configureTestingModule({
      imports: [NotificationSettingsPage, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: Api,
          useValue: {
            invoke: (fn: unknown, params?: { body: { items: NotificationPreferenceDto[] } }) => {
              if (fn === notificationsPreferences) return Promise.resolve(PREFS);
              if (fn === pushDevices) return Promise.resolve(devices);
              if (fn === notificationsUpdatePreferences) {
                saved.push(params!.body.items);
                return Promise.resolve(params!.body.items);
              }
              return Promise.reject(new Error('unexpected call'));
            },
          },
        },
      ],
    });
    TestBed.inject(SiteConfig).info.set({ ...SITE_FALLBACK, emailEnabled });
    const fixture = TestBed.createComponent(NotificationSettingsPage);
    fixture.detectChanges();
    // Both answers, then the matrix.
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    devices = [];
    saved = [];
  });

  const headers = (el: HTMLElement) =>
    [...el.querySelectorAll('th')].map((th) => th.textContent?.trim());

  it('without a phone with the app there is no Push column', async () => {
    const { el } = await render();
    expect(headers(el)).toEqual(['Event', 'In-app', 'Email']);
    expect(el.textContent).toContain('New chat message (email only while I am offline)');
  });

  it('with one, the Push column switches each type and is saved with the rest', async () => {
    devices = [PHONE];
    const { fixture, el } = await render();
    expect(headers(el)).toEqual(['Event', 'In-app', 'Email', 'Push']);
    expect(el.textContent).toContain('push notifications to your phone with the app');
    // A message pushed to the phone is not mailed, and the label says so.
    expect(el.textContent).toContain('it does not reach my phone');

    const pushBoxes = [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter(
      (b) => b.getAttribute('aria-label')?.startsWith('Push:'),
    );
    expect(pushBoxes.map((b) => b.checked)).toEqual([true, false, true]);
    pushBoxes[1]!.click();
    fixture.detectChanges();
    (el.querySelector('button') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    expect(saved).toHaveLength(1);
    expect(saved[0]!.find((p) => p.type === 'NEW_FOLLOWER')).toEqual({
      type: 'NEW_FOLLOWER',
      inApp: true,
      email: false,
      push: true,
    });
  });

  it('where no mail goes out, a phone shows the bell and Push only', async () => {
    devices = [PHONE];
    const { el } = await render(false);
    expect(headers(el)).toEqual(['Event', 'In-app', 'Push']);
    expect(el.textContent).toContain('under the bell, or as a push notification');
  });
});
