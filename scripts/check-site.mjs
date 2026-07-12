#!/usr/bin/env node
/**
 * Static-site integrity checker. Runs against dist/ after `npm run build`:
 *
 *   - every internal <a href> resolves to a built page or file
 *   - every local asset reference (src, srcset, poster, preload, css url())
 *     exists on disk
 *   - every page has exactly one <title>, one canonical (self-referential),
 *     a full hreflang set (5 locales + x-default) pointing at built pages,
 *     an <html lang> that matches its URL locale, and one <main> landmark
 *   - every JSON-LD block parses
 *   - sitemap.xml is well-formed, lists every indexable page exactly once,
 *     and contains no URL that 404s
 *
 * Exits non-zero with a failure list if anything is broken.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DIST = 'dist';
const SITE_URL = 'https://circlescr.com';
const LOCALES = ['en', 'es', 'fr', 'de', 'pt'];

const failures = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(2);
}

// ---- collect pages -------------------------------------------------------

const htmlFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.html')) htmlFiles.push(p);
  }
})(DIST);

/** Resolve a site-absolute path ("/es/about/", "/js/gsap.min.js") to a dist file. */
function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  const candidates = clean.endsWith('/')
    ? [join(DIST, clean, 'index.html')]
    : [join(DIST, clean), join(DIST, clean, 'index.html'), join(DIST, `${clean}.html`)];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile());
}

const pagePathOf = (file) => {
  let p = '/' + file.slice(DIST.length + 1).replace(/\\/g, '/');
  if (p.endsWith('/index.html')) p = p.slice(0, -'index.html'.length);
  return p;
};

const localeOf = (pagePath) => {
  const m = pagePath.match(/^\/(es|fr|de|pt)(\/|$)/);
  return m ? m[1] : 'en';
};

// ---- per-page checks -----------------------------------------------------

const attrRe = (attr) => new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'g');

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const page = pagePathOf(file);
  const isHostFallback404 = page === '/404.html';
  const is404 = /(^|\/)404(\/|\.html$)/.test(page);

  // titles and canonical
  const titles = html.match(/<title>/g) || [];
  if (titles.length !== 1) fail(`${page}: expected 1 <title>, found ${titles.length}`);
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
  if (canonicals.length !== 1) fail(`${page}: expected 1 canonical, found ${canonicals.length}`);
  else if (!is404) {
    const expected = `${SITE_URL}${page}`;
    if (canonicals[0] !== expected) fail(`${page}: canonical is ${canonicals[0]}, expected ${expected}`);
  }

  // html lang matches URL locale
  const lang = (html.match(/<html[^>]*\blang="([^"]*)"/) || [])[1];
  if (lang !== localeOf(page)) fail(`${page}: <html lang="${lang}"> but URL locale is "${localeOf(page)}"`);

  // exactly one main landmark
  const mains = html.match(/<main[\s>]/g) || [];
  if (mains.length !== 1) fail(`${page}: expected 1 <main>, found ${mains.length}`);

  // hreflang completeness (indexable pages only)
  const noindex = /name="robots" content="noindex/.test(html);
  if (!noindex) {
    const alts = [...html.matchAll(/hreflang="([^"]*)" href="([^"]*)"/g)];
    const tags = alts.map((m) => m[1]).sort();
    const expectedTags = [...LOCALES, 'x-default'].sort();
    if (JSON.stringify(tags) !== JSON.stringify(expectedTags))
      fail(`${page}: hreflang set is [${tags}] — expected [${expectedTags}]`);
    for (const [, tag, href] of alts) {
      if (!href.startsWith(SITE_URL)) { fail(`${page}: hreflang ${tag} is not absolute: ${href}`); continue; }
      if (!resolvePath(href.slice(SITE_URL.length))) fail(`${page}: hreflang ${tag} → ${href} does not resolve`);
    }
  }

  // internal links
  for (const [, href] of html.matchAll(attrRe('href'))) {
    if (/^(https?:|mailto:|tel:|#|data:)/.test(href) || href === '') continue;
    if (!resolvePath(href)) fail(`${page}: broken internal href "${href}"`);
  }

  // local assets: src, poster, data-poster-url, data-video-urls, srcset
  for (const attr of ['src', 'poster', 'data-poster-url']) {
    for (const [, val] of html.matchAll(attrRe(attr))) {
      if (!val.startsWith('/')) continue;
      if (!resolvePath(val)) fail(`${page}: missing asset ${attr}="${val}"`);
    }
  }
  for (const [, val] of html.matchAll(attrRe('data-video-urls'))) {
    for (const u of val.split(',')) {
      if (u.startsWith('/') && !resolvePath(u)) fail(`${page}: missing asset in data-video-urls "${u}"`);
    }
  }
  for (const [, val] of html.matchAll(attrRe('srcset'))) {
    for (const part of val.split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (u && u.startsWith('/') && !resolvePath(u)) fail(`${page}: missing srcset entry "${u}"`);
    }
  }

  // JSON-LD parses
  for (const [, block] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(block); } catch { fail(`${page}: invalid JSON-LD block`); }
  }
  void isHostFallback404;
}

// ---- CSS asset references -------------------------------------------------

const cssFiles = htmlFiles.length
  ? [...new Set(htmlFiles.flatMap((f) => {
      const html = readFileSync(f, 'utf8');
      return [...html.matchAll(/<link rel="stylesheet" href="([^"]*)"/g)].map((m) => m[1]);
    }))]
  : [];
const distCss = [];
(function findCss(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) findCss(p);
    else if (entry.name.endsWith('.css')) distCss.push(p);
  }
})(DIST);
for (const cssFile of distCss) {
  const css = readFileSync(cssFile, 'utf8');
  for (const [, rawUrl] of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    if (/^(data:|https?:|#)/.test(rawUrl)) continue;
    const base = rawUrl.startsWith('/') ? rawUrl : join('/', dirname(cssFile).slice(DIST.length), rawUrl);
    if (!resolvePath(base.replace(/\\/g, '/'))) fail(`${cssFile}: missing url() asset "${rawUrl}"`);
  }
}
void cssFiles;

// ---- sitemap ---------------------------------------------------------------

const sitemapFile = join(DIST, 'sitemap.xml');
if (!existsSync(sitemapFile)) {
  fail('sitemap.xml missing from dist/');
} else {
  const xml = readFileSync(sitemapFile, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  if (new Set(locs).size !== locs.length) fail('sitemap: duplicate <loc> entries');
  for (const loc of locs) {
    if (!loc.startsWith(SITE_URL)) { fail(`sitemap: non-absolute or foreign <loc> ${loc}`); continue; }
    if (!resolvePath(loc.slice(SITE_URL.length))) fail(`sitemap: <loc> ${loc} does not resolve to a built page`);
  }
  // every indexable page is listed
  const listed = new Set(locs.map((l) => l.slice(SITE_URL.length)));
  for (const file of htmlFiles) {
    const page = pagePathOf(file);
    const html = readFileSync(file, 'utf8');
    if (/name="robots" content="noindex/.test(html) || page === '/404.html') continue;
    if (!listed.has(page)) fail(`sitemap: indexable page ${page} not listed`);
  }
}

// ---- report ----------------------------------------------------------------

if (failures.length) {
  console.error(`\ncheck-site: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`check-site: OK — ${htmlFiles.length} pages, sitemap, links, assets, hreflang, canonicals, JSON-LD all valid.`);
