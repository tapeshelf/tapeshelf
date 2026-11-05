import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { By } from '@angular/platform-browser';

import { SITE_FALLBACK, SiteConfig } from '../../../core/site/site-config';
import { ThemeService } from '../../../core/theme/theme.service';
import { CaptchaComponent } from '../../../shared/ui/captcha/captcha';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AppCaptchaPage } from './app-captcha';

/** The widget without Cloudflare: the test answers for it. */
@Component({ selector: 'app-captcha', template: '' })
class WidgetStub {
  readonly siteKey = input.required<string>();
  readonly token = output<string | null>();
  readonly failed = output<void>();
  readonly shown = output<void>();
  readonly broken = output<void>();
}

describe('AppCaptchaPage', () => {
  const lang = document.documentElement.lang;
  const bridge = window as unknown as { TapeshelfCaptcha?: { postMessage(m: string): void } };
  let heard: unknown[];

  function open(query: Record<string, string> = {}, siteKey: string | null = 'site-key') {
    TestBed.configureTestingModule({
      imports: [AppCaptchaPage, provideTranslocoTesting()],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    }).overrideComponent(AppCaptchaPage, {
      remove: { imports: [CaptchaComponent] },
      add: { imports: [WidgetStub] },
    });
    TestBed.inject(SiteConfig).info.set({ ...SITE_FALLBACK, captchaSiteKey: siteKey });
    const fixture = TestBed.createComponent(AppCaptchaPage);
    fixture.detectChanges();
    const widget = () =>
      fixture.debugElement.query(By.directive(WidgetStub))?.componentInstance as
        WidgetStub | undefined;
    return { fixture, widget, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    localStorage.clear();
    heard = [];
    bridge.TapeshelfCaptcha = { postMessage: (m) => heard.push(JSON.parse(m)) };
  });
  afterEach(() => {
    delete bridge.TapeshelfCaptcha;
    localStorage.clear();
    document.documentElement.lang = lang;
  });

  it('shows the widget with the site’s key and hands its token to the app', () => {
    const { widget } = open();
    expect(widget()?.siteKey()).toBe('site-key');
    widget()!.token.emit('token-1');
    expect(heard).toEqual([{ token: 'token-1' }]);
  });

  it('tells the app when the widget is on the page', () => {
    const { widget } = open();
    expect(heard).toEqual([]);
    widget()!.shown.emit();
    expect(heard).toEqual([{ ready: true }]);
  });

  it('says nothing when a token runs out: the widget asks for the next one itself', () => {
    const { widget } = open();
    widget()!.token.emit(null);
    expect(heard).toEqual([]);
  });

  it('tells the app when the widget cannot load, and says so on the page', () => {
    const { fixture, widget, el } = open();
    widget()!.failed.emit();
    fixture.detectChanges();
    expect(heard).toEqual([{ failed: true }]);
    expect(el.querySelector('[data-testid="captcha-failed"]')).toBeTruthy();
    expect(widget()).toBeUndefined();
  });

  it('tells the app when the widget gives up (its frame did not load): the app offers to try again', () => {
    const { fixture, widget, el } = open();
    widget()!.shown.emit();
    widget()!.broken.emit();
    fixture.detectChanges();
    expect(heard).toEqual([{ ready: true }, { failed: true }]);
    expect(el.querySelector('[data-testid="captcha-failed"]')).toBeTruthy();
  });

  it('on a server without the check has no widget and tells the app so', () => {
    const { widget } = open({}, null);
    expect(widget()).toBeUndefined();
    expect(heard).toEqual([{ failed: true }]);
  });

  it('takes the app’s theme and language for this visit and remembers neither', () => {
    open({ theme: 'dark', lang: 'ru' });
    expect(TestBed.inject(ThemeService).resolved()).toBe('dark');
    expect(document.documentElement.lang).toBe('ru');
    expect(localStorage.getItem('vs.theme')).toBeNull();
    expect(localStorage.getItem('vs.lang')).toBeNull();
  });

  it('ignores a theme or a language it does not know', () => {
    open({ theme: 'pink', lang: 'xx' });
    expect(TestBed.inject(ThemeService).preference()).toBe('system');
    expect(document.documentElement.lang).toBe(lang);
  });

  it('in a browser, with no app listening, just shows the widget', () => {
    delete bridge.TapeshelfCaptcha;
    const { widget } = open();
    expect(() => widget()!.token.emit('token-1')).not.toThrow();
  });
});
