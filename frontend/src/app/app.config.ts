import { FullscreenOverlayContainer, OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { provideTransloco, provideTranslocoTranspiler } from '@jsverse/transloco';

import { routes } from './app.routes';
import { InputModalityService } from './core/a11y/input-modality';
import { AdminDictionary } from './core/admin/admin-dictionary.service';
import { viewAsInterceptor } from './core/admin/view-as.service';
import { asGuestInterceptor } from './core/preview/visitor-preview.service';
import { authRefreshInterceptor } from './core/auth/auth-refresh.interceptor';
import { AuthStore } from './core/auth/auth.store';
import { PreferencesSyncService } from './core/auth/preferences-sync.service';
import { apiInterceptor } from './core/http/api.interceptor';
import { AVAILABLE_LANGS, DEFAULT_LANG, LanguageService } from './core/i18n/language.service';
import { TranslatedTitleStrategy } from './core/i18n/title.strategy';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { SiteConfig } from './core/site/site-config';
import { SiteTranspiler } from './core/site/site.transpiler';
import { onViewTransitionCreated } from './core/navigation/view-transitions';
import { ThemeService } from './core/theme/theme.service';
import { UploadStore } from './core/upload/upload.store';
import { WsService } from './core/ws/ws.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated }),
    ),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
    // Dropdowns (app-select) must show inside the fullscreen video player too.
    { provide: OverlayContainer, useClass: FullscreenOverlayContainer },
    provideHttpClient(
      withInterceptors([
        apiInterceptor,
        viewAsInterceptor,
        asGuestInterceptor,
        authRefreshInterceptor,
      ]),
    ),
    provideTransloco({
      config: {
        availableLangs: [...AVAILABLE_LANGS],
        defaultLang: DEFAULT_LANG,
        fallbackLang: DEFAULT_LANG,
        reRenderOnLangChange: true,
        // an empty value is a value (the Russian hero has no word after the highlighted noun), not a missing key
        missingHandler: { allowEmpty: true },
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideTranslocoTranspiler(SiteTranspiler), // {{site}} and {{host}} in every text
    provideAppInitializer(() => {
      // Everything is injected synchronously: inject() is only valid before the first await.
      inject(ThemeService); // applies data-theme immediately
      const language = inject(LanguageService).init(); // the dictionary, before the first screen
      inject(InputModalityService).init(); // focus outlines for keyboard users only
      inject(PreferencesSyncService); // its effects start once the user is known
      inject(WsService); // connects once the user is known
      const auth = inject(AuthStore);
      const uploads = inject(UploadStore);
      const site = inject(SiteConfig);
      const adminDictionary = inject(AdminDictionary); // an admin's texts
      const me = auth.load();
      return Promise.all([
        language,
        site.load(),
        me.then(() => (auth.user() ? uploads.restore() : undefined)),
        Promise.all([language, me]).then(() => adminDictionary.init()),
      ]);
    }),
  ],
};
