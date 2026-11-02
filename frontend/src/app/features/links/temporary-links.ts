import { Dialog } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';

import type { LinkCandidate } from './links';

/** Opens "Temporary link" (everyone's; a password is Pro's) for the picked videos. */
@Injectable({ providedIn: 'root' })
export class TemporaryLinks {
  private readonly dialog = inject(Dialog);

  async offer(videos: LinkCandidate[], skipped = 0): Promise<void> {
    if (!videos.length) return;
    const { TemporaryLinkDialog } = await import('./temporary-link-dialog');
    this.dialog.open(TemporaryLinkDialog, {
      data: { videos, skipped },
      backdropClass: 'vs-backdrop',
      autoFocus: 'first-tabbable',
    });
  }
}
