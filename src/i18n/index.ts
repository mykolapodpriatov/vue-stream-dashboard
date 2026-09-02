import { createI18n } from 'vue-i18n';
import { en, type MessageSchema } from './en';
import { ru } from './ru';

export const LOCALES = ['en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/**
 * Composition-API-only i18n. `MessageSchema` is derived from the English
 * messages, so the Russian file cannot drift: a key missing on one side is a
 * type error, not a `[missing key]` in production.
 */
export function createAppI18n(locale: Locale = 'en') {
  return createI18n<[MessageSchema], Locale, false>({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: { en, ru },
    // Values are formatted per locale — a Ukrainian reader sees 5 000, not 5,000.
    numberFormats: {
      en: {
        integer: { maximumFractionDigits: 0 },
        decimal: { maximumFractionDigits: 2 },
      },
      ru: {
        integer: { maximumFractionDigits: 0 },
        decimal: { maximumFractionDigits: 2 },
      },
    },
    datetimeFormats: {
      en: {
        time: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
      },
      ru: {
        time: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
      },
    },
    missingWarn: false,
    fallbackWarn: false,
  });
}

export type AppI18n = ReturnType<typeof createAppI18n>;
