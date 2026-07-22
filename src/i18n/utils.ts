import { getRelativeLocaleUrl } from 'astro:i18n';
import { LOCALES, LOCALE_META, DEFAULT_LOCALE, SECONDARY_LOCALES, type Locale } from './locales.config';

/**
 * Builds the localized href for a locale-agnostic canonical path (e.g. "/about",
 * "/project/dentika", "/"), using Astro's official i18n URL builder. Page slugs are
 * intentionally left untranslated across locales, so the same canonical path maps
 * to every locale's URL.
 */
export function localizedPath(locale: Locale, canonicalPath: string): string {
  const trimmed = canonicalPath.replace(/^\/+/, '');
  return getRelativeLocaleUrl(locale, trimmed);
}

/** All {locale, href} pairs for a given canonical path, for hreflang tags and the language switcher. */
export function localizedAlternates(canonicalPath: string): { locale: Locale; tag: string; href: string }[] {
  return LOCALES.map((locale) => ({
    locale,
    tag: LOCALE_META[locale].tag,
    href: localizedPath(locale, canonicalPath),
  }));
}

/** getStaticPaths body shared by every src/pages/[locale]/ page. */
export function secondaryLocalePaths() {
  return SECONDARY_LOCALES.map((locale) => ({ params: { locale }, props: { locale } }));
}

/** getStaticPaths body for default-locale slug pages (post/[slug], project/[slug]). */
export function slugPaths(items: readonly { slug: string }[]) {
  return items.map(({ slug }) => ({ params: { slug }, props: { slug } }));
}

/** getStaticPaths body for localized slug pages ([locale]/post/[slug], [locale]/project/[slug]). */
export function localeSlugPaths(items: readonly { slug: string }[]) {
  return SECONDARY_LOCALES.flatMap((locale) =>
    items.map(({ slug }) => ({ params: { locale, slug }, props: { locale, slug } }))
  );
}

export { LOCALES, LOCALE_META, DEFAULT_LOCALE, SECONDARY_LOCALES };
export type { Locale };
