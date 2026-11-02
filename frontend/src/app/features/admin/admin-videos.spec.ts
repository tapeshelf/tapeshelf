import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Api, adminVideosList } from '../../api';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { AdminVideosPage } from './admin-videos';

class FakeApi {
  lists: Record<string, unknown>[] = [];
  async invoke(fn: unknown, params?: Record<string, unknown>): Promise<unknown> {
    if (fn === adminVideosList) {
      this.lists.push(params ?? {});
      return { items: [], total: 0 };
    }
    throw new Error('unexpected call');
  }
}

describe('AdminVideosPage', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps both searches when the second is typed while the first still waits', async () => {
    vi.useFakeTimers();
    const api = new FakeApi();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideRouter([]), { provide: Api, useValue: api }],
    });
    const fixture = TestBed.createComponent(AdminVideosPage);
    fixture.detectChanges();
    const [q, author] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
        'input[type="search"]',
      ),
    );
    q!.value = 'cats';
    q!.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(100);
    author!.value = '@anna';
    author!.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);

    expect(api.lists.at(-1)).toMatchObject({ q: 'cats', author: 'anna' });
  });
});
