import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AutoMoreComponent } from './auto-more';

@Component({
  imports: [AutoMoreComponent],
  template: `<app-auto-more [more]="more()" [count]="count()" [load]="load" />`,
})
class Host {
  readonly more = signal(true);
  readonly count = signal(10);
  calls = 0;
  fail = false;
  load = async () => {
    this.calls++;
    if (this.fail) throw new Error('offline');
    this.count.update((n) => n + 10);
  };
}

/** The line comes into view: what the browser's observer would report. */
let reach: (near: boolean) => void = () => undefined;

class FakeObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {
    reach = (near) =>
      this.callback(
        [{ isIntersecting: near } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('AutoMoreComponent', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    await TestBed.configureTestingModule({ imports: [Host, provideTranslocoTesting()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => vi.unstubAllGlobals());

  /**
   * Until the page in flight is drawn (its spinner gone): a fixed pause was too short on a busy
   * machine, and the next "near" then came while the first was still pending.
   */
  async function settle(): Promise<void> {
    await new Promise((r) => setTimeout(r, 20));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    });
    await fixture.whenStable();
  }

  it('brings the next page when the end comes near, and nothing before', async () => {
    expect(host.calls).toBe(0);
    reach(true);
    await settle();
    expect(host.calls).toBe(1);
    expect(host.count()).toBe(20);
    reach(true);
    await settle();
    expect(host.calls).toBe(2);
  });

  it('does nothing once everything is in', async () => {
    host.more.set(false);
    await fixture.whenStable();
    reach(true);
    await settle();
    expect(host.calls).toBe(0);
    expect(fixture.nativeElement.querySelector('[data-testid="auto-more"]')).toBeNull();
  });

  it('a failed page stops it and offers to try again', async () => {
    host.fail = true;
    reach(true);
    await settle();
    expect(host.calls).toBe(1);
    reach(true);
    await settle();
    expect(host.calls).toBe(1); // no hammering a failing server
    const retry = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(retry.textContent).toContain('Try again');
    host.fail = false;
    retry.click();
    await settle();
    expect(host.calls).toBe(2);
    expect(host.count()).toBe(20);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
