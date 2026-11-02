import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { errorText } from './api-error';

describe('errorText', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
    TestBed.inject(TranslocoService);
  });

  it('the server’s message; else "cannot reach the server"; else "something went wrong"', () => {
    const answered = new HttpErrorResponse({
      status: 409,
      error: { code: 'taken', message: 'That name is taken.', statusCode: 409 },
    });
    expect(errorText(answered)).toBe('That name is taken.');
    // No answer at all: the page says why instead of spinning for good.
    expect(errorText(new HttpErrorResponse({ status: 0 }))).toBe(
      'Cannot reach the server. Check your connection.',
    );
    expect(errorText(new HttpErrorResponse({ status: 502 }))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(errorText(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});
