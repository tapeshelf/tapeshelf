import {
  TRANSLOCO_TRANSPILER,
  TranslocoTestingModule,
  type TranslocoTestingOptions,
} from '@jsverse/transloco';

import { SiteTranspiler } from '../core/site/site.transpiler';

import en from '../../../public/i18n/en.json';
import ru from '../../../public/i18n/ru.json';
import adminEn from '../../../../backend/src/i18n/admin-ui/en.json';
import adminRu from '../../../../backend/src/i18n/admin-ui/ru.json';

/**
 * Real dictionaries, synchronous loading and the app's transpiler ({{site}}, {{host}}): tests see the
 * same strings users do — with the fallback instance name "tapeshelf" unless a test sets SiteConfig.
 * The admin panel's texts (served by the API to admins) are in as `admin.*`, as for an admin.
 */
export function provideTranslocoTesting(options: TranslocoTestingOptions = {}) {
  const testing = TranslocoTestingModule.forRoot({
    langs: { en: { ...en, admin: adminEn }, ru: { ...ru, admin: adminRu } },
    translocoConfig: {
      availableLangs: ['en', 'ru'],
      defaultLang: 'en',
      reRenderOnLangChange: true,
    },
    preloadLangs: true,
    ...options,
  });
  return {
    ...testing,
    providers: [
      ...(testing.providers ?? []),
      { provide: TRANSLOCO_TRANSPILER, useClass: SiteTranspiler },
    ],
  };
}
