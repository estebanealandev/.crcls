import { localizedPath, type Locale } from '../i18n/utils';

export const SITE_URL = "https://www.circlescr.com";
export const SITE_NAME = "Circles";

export const BUSINESS_ID = `${SITE_URL}/#business`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export const GEO = {
  latitude: 9.3786,
  longitude: -83.703,
  placename: "San Isidro de El General, Pérez Zeledón, Costa Rica",
};

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** Absolute URL of a locale-agnostic canonical path (e.g. "/about") in the given locale. */
export function localizedAbsoluteUrl(locale: Locale, canonicalPath: string): string {
  return new URL(localizedPath(locale, canonicalPath), SITE_URL).toString();
}

/**
 * JSON.stringify hardened for inline <script> blocks: escapes "<" so a value
 * containing "</script>" can never terminate the surrounding tag.
 */
export function jsonLdString(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
