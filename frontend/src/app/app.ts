import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { LayoutFrame } from './core/layout/frame';
import { NavigationHistory } from './core/navigation/navigation-history';
import { UploadStore } from './core/upload/upload.store';
import { UploadPanelComponent } from './features/videos/upload-panel';
import { PanelHostComponent } from './layout/panel/panel-host';
import { DemoBannerComponent } from './layout/demo-banner/demo-banner';
import { VisitorBannerComponent } from './layout/visitor-banner/visitor-banner';
import { CompactFooterComponent } from './layout/footer/compact-footer';
import { HeaderComponent } from './layout/header/header';
import { VerifyBannerComponent } from './layout/verify-banner/verify-banner';
import { ViewAsBannerComponent } from './layout/view-as-banner/view-as-banner';
import { ToastHostComponent } from './shared/ui/toast/toast-host';
import { ConnectionStatusComponent } from './layout/connection-status/connection-status';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    HeaderComponent,
    VerifyBannerComponent,
    ViewAsBannerComponent,
    ToastHostComponent,
    ConnectionStatusComponent,
    UploadPanelComponent,
    PanelHostComponent,
    CompactFooterComponent,
    DemoBannerComponent,
    VisitorBannerComponent,
  ],
  template: `
    <app-demo-banner />
    <app-view-as-banner />
    <app-visitor-banner />
    <app-verify-banner />
    <app-header />
    <main class="vt-page flex-1 pt-3 pb-10" [class]="layout.frame()">
      <router-outlet />
    </main>
    <app-compact-footer />
    <app-panel-host />
    <!-- Its code comes with the first upload: it was in the first download of every page. -->
    @defer (when uploads.panelOpen() && uploads.items().length > 0) {
      <app-upload-panel />
    }
    <app-toast-host />
    <app-connection-status />
  `,
})
export class App {
  protected readonly layout = inject(LayoutFrame);
  /** Created at the start all the same: it picks up the uploads a reload interrupted. */
  protected readonly uploads = inject(UploadStore);

  constructor() {
    inject(NavigationHistory); // starts recording from the first navigation
  }
}
