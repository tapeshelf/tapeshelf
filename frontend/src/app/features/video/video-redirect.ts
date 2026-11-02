import { Component, effect, inject, input, resource } from '@angular/core';
import { Router } from '@angular/router';

import { Api, videosContext } from '../../api';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { NotFoundPage } from '../not-found/not-found';
import { videoLink, videoState } from '../../core/navigation/user-links';

/**
 * Old video links, /v/<id> and /@username/v/<id>: find the short code and open /<code>.
 * A username in the link stays the context; without one the video opens on the viewer's own
 * shelf when they hold it, else on the author's.
 */
@Component({
  selector: 'app-video-redirect',
  imports: [SpinnerComponent, NotFoundPage],
  template: `
    @if (context.error()) {
      <app-not-found />
    } @else {
      <div class="flex justify-center py-16 text-muted"><app-spinner /></div>
    }
  `,
})
export class VideoRedirectPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly videoId = input.required<string>();
  readonly username = input<string>();
  protected readonly context = resource({
    params: () => ({ id: this.videoId() }),
    loader: ({ params }) => this.api.invoke(videosContext, params),
  });

  constructor() {
    effect(() => {
      // value() throws while the resource is in error state; hasValue() narrows safely.
      if (!this.context.hasValue()) return;
      const ctx = this.context.value();
      void this.router.navigate(videoLink(ctx.code), {
        replaceUrl: true,
        state: videoState(this.username()),
      });
    });
  }
}
