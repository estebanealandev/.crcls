export const LOCALES = ['en', 'es', 'fr', 'de', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const SECONDARY_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE) as Exclude<
  Locale,
  typeof DEFAULT_LOCALE
>[];

interface LocaleMeta {
  /** BCP 47 tag used in <html lang>, hreflang, and JSON-LD inLanguage */
  tag: string;
  /** Open Graph og:locale value */
  ogLocale: string;
  /** Name of the language, written in that language, for the language switcher */
  nativeName: string;
  /** Flag emoji shown in the language switcher */
  flag: string;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { tag: 'en', ogLocale: 'en_US', nativeName: 'English', flag: '🇺🇸' },
  es: { tag: 'es', ogLocale: 'es_ES', nativeName: 'Español', flag: '🇪🇸' },
  fr: { tag: 'fr', ogLocale: 'fr_FR', nativeName: 'Français', flag: '🇫🇷' },
  de: { tag: 'de', ogLocale: 'de_DE', nativeName: 'Deutsch', flag: '🇩🇪' },
  pt: { tag: 'pt', ogLocale: 'pt_PT', nativeName: 'Português', flag: '🇵🇹' },
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
