import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const fingerprints = new Map<string, string>();

/**
 * URL of a file served from public/ with a content fingerprint appended
 * ("/js/gsap.min.js" → "/js/gsap.min.js?v=1a2b3c4d5e").
 *
 * Cloudflare caches /js/* at the edge and hands browsers a multi-hour TTL, so a
 * file edited in place keeps being served stale after a deploy. The query
 * string is part of both cache keys and changes whenever the bytes do, while
 * the scripts stay plain classic <script> tags (load order, globals and
 * `defer` semantics untouched). Computed at build time; a missing file fails
 * the build instead of shipping a broken reference.
 */
export function versioned(publicPath: string): string {
  let url = fingerprints.get(publicPath);
  if (!url) {
    const file = join(process.cwd(), 'public', publicPath.replace(/^\/+/, ''));
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10);
    url = `${publicPath}?v=${hash}`;
    fingerprints.set(publicPath, url);
  }
  return url;
}
