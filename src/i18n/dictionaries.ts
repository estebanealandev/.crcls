import { LOCALES, type Locale } from './locales.config';

/**
 * Every locale JSON in src/i18n/locales, loaded eagerly at build time.
 * Keys look like "./locales/<namespace>/<locale>.json"; namespaces may be
 * nested (e.g. "projects/atlas").
 */
const modules = import.meta.glob('./locales/**/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

/**
 * All five locale dictionaries for a namespace, keyed by locale.
 * The type parameter is anchored to the English file at the call site:
 *
 *   import en from '../i18n/locales/home/en.json';
 *   const DICT = dictionaries<typeof en>('home');
 *
 * Throws at build time if any locale file is missing, so an incomplete
 * translation set fails the build instead of shipping mixed languages.
 */
export function dictionaries<T>(namespace: string): Record<Locale, T> {
  const out = {} as Record<Locale, T>;
  for (const locale of LOCALES) {
    const key = `./locales/${namespace}/${locale}.json`;
    const mod = modules[key];
    if (mod === undefined) throw new Error(`Missing locale file: src/i18n/${key.slice(2)}`);
    out[locale] = mod as T;
  }
  return out;
}

/**
 * dictionaries() for a family of per-slug namespaces (e.g. "projects/<slug>").
 * Returns an accessor that throws on unknown slugs, so lookups stay total.
 */
export function slugDictionaries<T>(
  base: string,
  slugs: readonly string[]
): (slug: string) => Record<Locale, T> {
  const table = new Map(slugs.map((slug) => [slug, dictionaries<T>(`${base}/${slug}`)]));
  return (slug) => {
    const dict = table.get(slug);
    if (!dict) throw new Error(`No locale dictionaries loaded for ${base}/${slug}`);
    return dict;
  };
}
