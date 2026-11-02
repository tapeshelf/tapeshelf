import { localeFromAcceptLanguage, t, toSupportedLocale } from './i18n.js';

describe('i18n', () => {
  it('translates in every language of the app and falls back to English', () => {
    expect(t('en', 'errors.notFound')).toBe('Not found.');
    expect(t('ru', 'errors.notFound')).toBe('Не найдено.');
    expect(t('de', 'errors.notFound')).toBe('Nicht gefunden.');
    expect(t('ar', 'errors.notFound')).toBe('Not found.');
    expect(t(undefined, 'errors.notFound')).toBe('Not found.');
  });

  it('normalizes locale tags', () => {
    expect(toSupportedLocale('ru-RU')).toBe('ru');
    expect(toSupportedLocale('EN')).toBe('en');
    expect(toSupportedLocale('pt-BR')).toBe('pt');
    expect(toSupportedLocale('ar')).toBe('en');
    expect(toSupportedLocale(null)).toBe('en');
  });

  it('picks the first supported language from Accept-Language', () => {
    expect(localeFromAcceptLanguage('ar-EG,ar;q=0.9,ru;q=0.8,en;q=0.7')).toBe(
      'ru',
    );
    expect(localeFromAcceptLanguage('de')).toBe('de');
    expect(localeFromAcceptLanguage('fa')).toBe('en');
    expect(localeFromAcceptLanguage(undefined)).toBe('en');
  });

  it('picks the plural form by count in both languages; Russian never falls back to English', () => {
    expect(
      t('en', 'errors.auth.usernameChangeTooSoon', { days: 1, count: 1 }),
    ).toBe('You can change your username again in 1 day.');
    expect(
      t('en', 'errors.auth.usernameChangeTooSoon', { days: 3, count: 3 }),
    ).toBe('You can change your username again in 3 days.');
    for (const count of [1, 3, 5, 21])
      expect(t('ru', 'errors.auth.tooManyAttempts', { count })).toBe(
        `Слишком много попыток входа. Попробуйте через ${count} мин.`,
      );
    expect(
      t('ru', 'mail.notifications.REQUEST_RECEIVED.body', {
        name: 'Ann',
        title: 'Trip',
        count: 3,
      }),
    ).toContain('поделились 3 видео');
    // Polish has its own few/many forms.
    expect(t('pl', 'errors.auth.tooManyAttempts', { count: 3 })).toContain(
      '3 minuty',
    );
  });
});
