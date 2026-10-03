import type { APIRoute } from 'astro';
import { LOCALES, DEFAULT_LOCALE, localizedPath } from '../i18n/utils';
import { SITE_URL } from '../lib/seo';
import { PROJECT_PAGES } from '../data/projects';
import { POSTS } from '../data/posts';

interface SitemapPage {
  path: string;
  priority: string;
}

const STATIC_PAGES: SitemapPage[] = [
  { path: '/', priority: '1.0' },
  { path: '/about', priority: '0.8' },
  { path: '/work', priority: '0.8' },
  { path: '/contact', priority: '0.8' },
  { path: '/journal', priority: '0.7' },
  ...PROJECT_PAGES.map((p) => ({ path: `/project/${p.slug}`, priority: '0.6' })),
  ...POSTS.map((p) => ({ path: `/post/${p.slug}`, priority: '0.5' })),
];

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString().slice(0, 10);

  const urlEntries = STATIC_PAGES.flatMap((page) =>
    LOCALES.map((locale) => {
      const loc = escapeXml(new URL(localizedPath(locale, page.path), SITE_URL).toString());
      const alternates = LOCALES.map(
        (altLocale) =>
          `      <xhtml:link rel="alternate" hreflang="${altLocale}" href="${escapeXml(new URL(localizedPath(altLocale, page.path), SITE_URL).toString())}" />`
      ).join('\n');
      const xDefault = `      <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(new URL(localizedPath(DEFAULT_LOCALE, page.path), SITE_URL).toString())}" />`;

      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${page.priority}</priority>
${alternates}
${xDefault}
  </url>`;
    })
  );

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries.join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
