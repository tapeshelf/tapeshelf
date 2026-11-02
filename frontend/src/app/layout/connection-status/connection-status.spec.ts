import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { WsService } from '../../core/ws/ws.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ConnectionStatusComponent, LOST_AFTER_MS } from './connection-status';

describe('ConnectionStatusComponent', () => {
  it('says the connection is lost only after a few seconds, and goes once it is back', async () => {
    vi.useFakeTimers();
    try {
      const lost = signal(false);
      TestBed.configureTestingModule({
        imports: [ConnectionStatusComponent, provideTranslocoTesting()],
        providers: [{ provide: WsService, useValue: { lost } }],
      });
      const fixture = TestBed.createComponent(ConnectionStatusComponent);
      const shown = () =>
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="connection-lost"]');
      fixture.detectChanges();
      lost.set(true);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(LOST_AFTER_MS - 500);
      fixture.detectChanges();
      expect(shown()).toBeNull(); // a short blip says nothing
      await vi.advanceTimersByTimeAsync(600);
      fixture.detectChanges();
      expect(shown()?.textContent).toContain('No connection');
      lost.set(false);
      fixture.detectChanges();
      expect(shown()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
