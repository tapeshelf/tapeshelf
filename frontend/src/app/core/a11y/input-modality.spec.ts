import { InputModalityDetector } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { InputModalityService } from './input-modality';

describe('InputModalityService', () => {
  it('writes the last input modality onto <html data-input>', () => {
    const changes = new Subject<string | null>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: InputModalityDetector,
          useValue: { mostRecentModality: null, modalityChanged: changes },
        },
      ],
    });
    const root = TestBed.inject(DOCUMENT).documentElement;
    TestBed.inject(InputModalityService).init();
    expect(root.hasAttribute('data-input')).toBe(false);
    changes.next('keyboard');
    expect(root.getAttribute('data-input')).toBe('keyboard');
    changes.next('mouse');
    expect(root.getAttribute('data-input')).toBe('mouse');
    changes.next(null);
    expect(root.hasAttribute('data-input')).toBe(false);
  });
});
