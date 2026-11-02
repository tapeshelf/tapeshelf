import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { ClipboardService } from './clipboard.service';

describe('ClipboardService', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  afterEach(() => {
    vi.restoreAllMocks();
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else delete (navigator as { clipboard?: Clipboard }).clipboard;
  });

  function setup(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
    const toast = TestBed.inject(ToastService);
    const success = vi.spyOn(toast, 'success');
    const error = vi.spyOn(toast, 'error');
    return { service: TestBed.inject(ClipboardService), success, error };
  }

  it('copies the text and says so with the given text', async () => {
    const written: string[] = [];
    const { service, success, error } = setup(async (text) => void written.push(text));
    expect(await service.copy('https://example.test/abc', 'video.linkCopied')).toBe(true);
    expect(written).toEqual(['https://example.test/abc']);
    expect(success).toHaveBeenCalledWith('Link copied.');
    expect(error).not.toHaveBeenCalled();
  });

  it('says it could not when the browser refuses', async () => {
    const { service, success, error } = setup(() => Promise.reject(new Error('denied')));
    expect(await service.copy('x', 'video.linkCopied')).toBe(false);
    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });
});
