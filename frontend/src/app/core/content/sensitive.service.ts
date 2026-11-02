import { Dialog } from '@angular/cdk/dialog';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../api/api';
import { usersUpdateProfile } from '../../api/fn/users/users-update-profile';
import { ViewAsService } from '../admin/view-as.service';
import { AuthStore } from '../auth/auth.store';
import { VisitorPreview } from '../preview/visitor-preview.service';
import { SensitiveDialogComponent } from './sensitive-dialog';

const STORAGE_KEY = 'vs.sensitive';

/** A video as the policy sees it: the author always sees their own pictures. */
export interface SensitiveVideo {
  sensitive: boolean;
  author?: { id: string };
}

/**
 * Videos marked sensitive: their covers and previews are blurred until the viewer agrees
 * once. A guest's agreement lives in this browser (localStorage) and is copied into the account at
 * registration; for a signed-in user the account flag `showSensitive` is the only truth — it can be
 * switched off again in settings, and no old browser state overrides that.
 */
@Injectable({ providedIn: 'root' })
export class SensitiveContentService {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(Api);
  private readonly dialog = inject(Dialog);
  private readonly viewAs = inject(ViewAsService);
  private readonly preview = inject(VisitorPreview);

  private readonly guest = signal(readStored());
  /** An agreement that could not be saved to the account (admin "view as", a failed request): this session only. */
  private readonly session = signal(false);

  /** The guest's agreement in this browser; sent along with a registration. */
  readonly guestConsent = this.guest.asReadonly();
  readonly allowed = computed(() => {
    // Previewing as a visitor: a fresh guest, whatever the account or this browser agreed to.
    if (this.preview.active()) return this.preview.consent();
    const user = this.auth.user();
    return user ? user.showSensitive || this.session() : this.guest();
  });

  constructor() {
    // Another account in the same tab starts from its own flag.
    let last: string | undefined;
    effect(() => {
      const id = this.auth.user()?.id;
      if (id === last) return;
      last = id;
      this.session.set(false);
    });
  }

  /** Whether this video's pictures are blurred for the current viewer. */
  blurs(video: SensitiveVideo): boolean {
    if (!video.sensitive || this.allowed()) return false;
    const me = this.preview.active() ? null : this.auth.user();
    return !(me && video.author && video.author.id === me.id);
  }

  /** Asks once (the dialog) unless already allowed; resolves to whether the viewer may go on. */
  async ensure(): Promise<boolean> {
    if (this.allowed()) return true;
    const ref = this.dialog.open<boolean>(SensitiveDialogComponent, {
      backdropClass: 'vs-backdrop',
      autoFocus: '[cdkFocusInitial]',
    });
    if ((await firstValueFrom(ref.closed)) !== true) return false;
    await this.agree();
    return true;
  }

  /** Remembers the agreement: in the account when signed in, in this browser otherwise. */
  async agree(): Promise<void> {
    if (this.preview.active()) {
      this.preview.consent.set(true);
      return;
    }
    const user = this.auth.user();
    if (!user) {
      writeStored();
      this.guest.set(true);
      return;
    }
    if (user.showSensitive) return;
    if (this.viewAs.active()) {
      this.session.set(true);
      return;
    }
    try {
      this.auth.setUser(
        await this.api.invoke(usersUpdateProfile, { body: { showSensitive: true } }),
      );
    } catch {
      this.session.set(true);
    }
  }
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private mode or blocked storage: the agreement lasts for this page only.
  }
}
