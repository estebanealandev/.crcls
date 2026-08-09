#!/usr/bin/env node
/**
 * Regenerates the `script-src` inline hashes in firebase.json from the built
 * HTML in dist/.
 *
 * Firebase Hosting headers are static config, so the CSP can't be computed at
 * request time the way the old Node server did it. Running this as a postbuild
 * step keeps the policy from drifting: change any inline script and the hash
 * list is rewritten on the next `npm run build`.
 *
 * Data blocks (application/ld+json) are not executable and are skipped —
 * CSP script-src does not apply to them.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const DIST = 'dist';
const CONFIG = 'firebase.json';

if (!existsSync(DIST)) {
  console.error(`${DIST}/ not found — run \`astro build\` first.`);
  process.exit(2);
}

const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const hashes = new Set();

(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    const html = readFileSync(path, 'utf8');
    for (const match of html.matchAll(scriptRe)) {
      const attrs = match[1] || '';
      if (/\bsrc\s*=/i.test(attrs)) continue;
      if (/type\s*=\s*["']application\/(ld\+)?json["']/i.test(attrs)) continue;
      const body = match[2];
      if (!body.trim()) continue;
      hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    }
  }
})(DIST);

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const block = config.hosting.headers.find((h) => h.source === '**');
const cspHeader = block?.headers.find((h) => h.key === 'Content-Security-Policy');

if (!cspHeader) {
  console.error(`No Content-Security-Policy header found under source "**" in ${CONFIG}.`);
  process.exit(2);
}

const directives = cspHeader.value.split('; ');
const index = directives.findIndex((d) => d.startsWith('script-src '));
if (index === -1) {
  console.error(`No script-src directive found in the CSP in ${CONFIG}.`);
  process.exit(2);
}

// Rebuild script-src: keep every non-hash source, re-insert the fresh hashes
// straight after 'self' so the directive stays readable across rebuilds.
const sources = directives[index].slice('script-src '.length).split(/\s+/).filter(Boolean);
const kept = sources.filter((s) => !/^'sha(256|384|512)-/.test(s));
const selfAt = kept.indexOf("'self'");
const sorted = [...hashes].sort();
kept.splice(selfAt === -1 ? kept.length : selfAt + 1, 0, ...sorted);

const next = `script-src ${kept.join(' ')}`;
if (directives[index] === next) {
  console.log(`CSP: ${sorted.length} inline script hash(es) — firebase.json already up to date.`);
  process.exit(0);
}

directives[index] = next;
cspHeader.value = directives.join('; ');
writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
console.log(`CSP: wrote ${sorted.length} inline script hash(es) to ${CONFIG}.`);
