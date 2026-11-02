import { InputModalityDetector } from '@angular/cdk/a11y';
import { DOCUMENT, Injectable, inject } from '@angular/core';

/**
 * Mirrors how the person last interacted (keyboard, mouse, touch) onto `<html data-input>`, so the
 * stylesheet shows focus outlines only for keyboard users. The browser's own
 * `:focus-visible` also fires on focus moved by script — a dialog opening, the player taking focus
 * after a click — which painted orange rings nobody asked for.
 */
@Injectable({ providedIn: 'root' })
export class InputModalityService {
  private readonly detector = inject(InputModalityDetector);
  private readonly document = inject(DOCUMENT);

  init(): void {
    this.apply(this.detector.mostRecentModality);
    this.detector.modalityChanged.subscribe((modality) => this.apply(modality));
  }

  private apply(modality: string | null): void {
    const root = this.document.documentElement;
    if (modality) root.setAttribute('data-input', modality);
    else root.removeAttribute('data-input');
  }
}
