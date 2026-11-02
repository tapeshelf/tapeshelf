import { TestBed } from '@angular/core/testing';

import { ExchangeSceneComponent } from './exchange-scene';

describe('ExchangeSceneComponent', () => {
  it('draws the two covers, decorative only', () => {
    TestBed.configureTestingModule({ imports: [ExchangeSceneComponent] });
    const fixture = TestBed.createComponent(ExchangeSceneComponent);
    fixture.componentRef.setInput('give', {
      thumbnailUrl: 'https://x/give.webp',
      sensitive: false,
    });
    fixture.componentRef.setInput('get', { thumbnailUrl: 'https://x/get.webp', sensitive: false });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect([...host.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([
      'https://x/give.webp',
      'https://x/get.webp',
    ]);
  });
});
