import { Component, DOCUMENT, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';

import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { PageTitle, TranslatedTitleStrategy } from './title.strategy';

@Component({ template: '' })
class Blank {}

const videoTitle = signal<string | null>(null);

@Component({ template: '' })
class Named {
  constructor() {
    inject(PageTitle).track(() => videoTitle());
  }
}

describe('TranslatedTitleStrategy', () => {
  let router: Router;
  let document: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', component: Blank, title: 'app.name' },
          { path: 'faq', component: Blank, title: 'download.title' },
          { path: 'plain', component: Blank },
          { path: 'named', component: Named },
        ]),
        { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
      ],
    });
    router = TestBed.inject(Router);
    document = TestBed.inject(DOCUMENT);
  });

  it('translates the route title and adds the brand', async () => {
    await router.navigateByUrl('/faq');
    expect(document.title).toBe('Download · tapeshelf');
  });

  it('leaves a title that already names the brand alone', async () => {
    await router.navigateByUrl('/');
    expect(document.title).toBe('tapeshelf');
  });

  it('shows the brand alone where a route has no title', async () => {
    await router.navigateByUrl('/plain');
    expect(document.title).toBe('tapeshelf');
  });

  it('follows a language change', async () => {
    await router.navigateByUrl('/faq');
    TestBed.inject(TranslocoService).setActiveLang('ru');
    expect(document.title).toBe('Скачивание · tapeshelf');
  });

  it('shows the page’s own title once it has one, and drops it when the page goes', async () => {
    videoTitle.set(null);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/named');
    TestBed.tick();
    expect(document.title).toBe('tapeshelf');
    videoTitle.set('Lake at dawn');
    TestBed.tick();
    expect(document.title).toBe('Lake at dawn · tapeshelf');
    await harness.navigateByUrl('/faq');
    TestBed.tick();
    expect(document.title).toBe('Download · tapeshelf');
  });
});
