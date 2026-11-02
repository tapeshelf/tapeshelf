import { Component, computed, inject, input, resource } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { Api, authGoogleStatus } from '../../api';

/** Full-page navigation to the backend OAuth start endpoint; hidden when Google is not configured. */
@Component({
  selector: 'app-google-button',
  imports: [TranslocoPipe],
  template: `
    @if (status.value()?.enabled) {
      <a
        [href]="href()"
        class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-2 text-sm font-medium transition-colors hover:bg-surface-3"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12S6.6 21.7 12 21.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
          />
        </svg>
        {{ 'auth.google' | transloco }}
      </a>
      <div class="my-4 flex items-center gap-3 text-xs text-faint">
        <span class="h-px flex-1 bg-border"></span>{{ 'common.or' | transloco
        }}<span class="h-px flex-1 bg-border"></span>
      </div>
    }
  `,
})
export class GoogleButtonComponent {
  private readonly api = inject(Api);
  /** Where to land after signing in; none = the user's own page (the server knows the username). */
  readonly returnTo = input<string>();
  protected readonly status = resource({ loader: () => this.api.invoke(authGoogleStatus) });
  protected readonly href = computed(() => {
    const to = this.returnTo();
    return to ? `/api/auth/google?returnTo=${encodeURIComponent(to)}` : '/api/auth/google';
  });
}
