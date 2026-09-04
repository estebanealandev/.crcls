import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sirv from 'sirv';
import compression from 'compression';

const PORT = process.env.PORT || 3000;
const LOCALE_PREFIXES = ['es', 'fr', 'de', 'pt'];
const LOCALE_PREFIX_RE = new RegExp(`^/(${LOCALE_PREFIXES.join('|')})(/|$)`);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'hello@circlescr.com';
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || 'Circles <hello@circlescr.com>';

// CSP script hashes are derived from the built HTML at startup, so a change
// to any inline script can never drift out of sync with the policy. Data
// blocks (application/ld+json) are not executable and are skipped — CSP
// script-src does not apply to them.
function collectInlineScriptHashes(root) {
  const hashes = new Set();
  if (!existsSync(root)) {
    console.warn(`[CSP] Warning: directory '${root}' does not exist yet. No inline script hashes collected.`);
    return [];
  }
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith('.html')) {
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
    }
  };
  walk(root);
  return [...hashes].sort();
}

const SCRIPT_HASHES = collectInlineScriptHashes('dist');
console.log(`CSP: allowing ${SCRIPT_HASHES.length} inline script hash(es) found in dist/`);

// Microsoft Clarity load-balances across multiple environments in production
// (https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-csp),
// so the wildcard subdomain is required rather than a fixed host list.
const CLARITY_SCRIPT_SRC = 'https://*.clarity.ms https://c.bing.com';
const CLARITY_CONNECT_SRC = 'https://*.clarity.ms https://c.bing.com';
const CLARITY_IMG_SRC = 'https://*.clarity.ms https://c.bing.com';

// Google Analytics 4 (gtag.js, no GTM). google-analytics.com/analytics.google.com
// receive the actual measurement pings; googletagmanager.com serves gtag.js itself.
const GA4_SCRIPT_SRC = 'https://www.googletagmanager.com';
const GA4_CONNECT_SRC = 'https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com';
const GA4_IMG_SRC = 'https://*.google-analytics.com';

const CSP = [
  "default-src 'self'",
  `script-src 'self' ${SCRIPT_HASHES.join(' ')} ${CLARITY_SCRIPT_SRC} ${GA4_SCRIPT_SRC}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${CLARITY_IMG_SRC} ${GA4_IMG_SRC}`,
  "font-src 'self' data:",
  "media-src 'self' data: https://videos.pexels.com",
  `connect-src 'self' ${CLARITY_CONNECT_SRC} ${GA4_CONNECT_SRC}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const HASHED_ASSET_RE = /\/_astro\/|\/js\/webflow\.[0-9a-f]{8}\./;

const assets = sirv('dist', {
  etag: true,
  setHeaders(res, pathname) {
    if (HASHED_ASSET_RE.test(pathname)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (pathname.endsWith('.html') || pathname.endsWith('/') || !/\.[a-z0-9]+$/i.test(pathname)) {
      // HTML documents (served as /, /path/, /path, or explicit .html) must
      // revalidate on every request so deploys propagate immediately.
      res.setHeader('Cache-Control', 'no-cache');
    } else if (pathname.startsWith('/assets/')) {
      // Fonts, images, and videos change rarely and only alongside a deploy.
      res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  },
});

// ---- Form endpoint support (Resend) & Hardening ----

const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMITS = {
  contact: { windowMs: 10 * 60 * 1000, max: 5 },
  subscribe: { windowMs: 10 * 60 * 1000, max: 5 },
};
const MAX_RATE_BUCKETS = 10000; // Cap map size to avoid Out-Of-Memory (DoS) attacks
const rateBuckets = new Map(); // `${scope}:${ip}` -> [timestamps]
const MIN_SUBMIT_MS = 1200; // reject submissions faster than a human could plausibly type

const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$/;
const IPV6_RE = /^(?:[a-fA-F0-9]{1,4}:){1,7}[a-fA-F0-9]{1,4}$|^::(?:[a-fA-F0-9]{1,4}:){0,6}[a-fA-F0-9]{1,4}$|^(?:[a-fA-F0-9]{1,4}:){1,7}:$/;

function normalizeIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return 'unknown';
  const ip = rawIp.trim().replace(/^::ffff:/, ''); // normalize IPv4-mapped IPv6
  if (IPV4_RE.test(ip)) {
    return ip;
  }
  // Group IPv6 into /64 subnet prefix to prevent residential rotation bypass
  if (IPV6_RE.test(ip) || (ip.includes(':') && ip.length <= 45)) {
    const segments = ip.split(':').filter(Boolean).slice(0, 4);
    return `${segments.join(':')}::/64`;
  }
  return 'unknown';
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    // Take the closest proxy-appended hop (rightmost) to avoid client-spoofed prefix
    const candidate = parts[parts.length - 1] || parts[0];
    const normalized = normalizeIp(candidate);
    if (normalized !== 'unknown') return normalized;
  }
  return normalizeIp(req.socket.remoteAddress);
}

function isRateLimited(scope, ip) {
  const limit = RATE_LIMITS[scope];
  if (!limit) return false;
  const { windowMs, max } = limit;
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= max) {
    rateBuckets.set(key, timestamps);
    return true;
  }
  // Enforce memory capacity limit (LRU / FIFO eviction)
  if (rateBuckets.size >= MAX_RATE_BUCKETS && !rateBuckets.has(key)) {
    const oldestKey = rateBuckets.keys().next().value;
    if (oldestKey) rateBuckets.delete(oldestKey);
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return false;
}

// Prune stale entries every 2 minutes to prevent long-term memory buildup
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateBuckets) {
    const scope = key.split(':')[0];
    const windowMs = RATE_LIMITS[scope]?.windowMs ?? 10 * 60 * 1000;
    const fresh = timestamps.filter((t) => now - t < windowMs);
    if (fresh.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, fresh);
  }
}, 2 * 60 * 1000).unref();

// Allowed hosts for CORS / Origin validation
const TRUSTED_HOSTS = new Set([
  'circlescr.com',
  'www.circlescr.com',
  'localhost',
  '127.0.0.1',
  ...(process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',').map((h) => h.trim().toLowerCase()) : []),
]);

function isHostAllowed(hostWithPort) {
  if (!hostWithPort || typeof hostWithPort !== 'string') return false;
  const hostname = hostWithPort.split(':')[0].toLowerCase();
  if (TRUSTED_HOSTS.has(hostname)) return true;
  if (hostname.endsWith('.railway.app')) return true;
  return false;
}

function isTrustedOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') return false;
    if (originUrl.host !== host) return false;
    return isHostAllowed(originUrl.host);
  } catch {
    return false;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];
    let aborted = false;

    function onData(chunk) {
      if (aborted) return;
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        aborted = true;
        req.removeListener('data', onData);
        req.pause();
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    }

    req.on('data', onData);
    req.on('end', () => {
      if (aborted) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Strips non-printable / control characters (null bytes, bell, escape, etc.).
// Preserves \r and \n when allowNewlines is true (for contact message bodies).
function cleanText(value, maxLength, allowNewlines = false) {
  if (typeof value !== 'string') return '';
  const regex = allowNewlines
    ? /[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g
    : /[\x00-\x1F\x7F]/g;
  return value.replace(regex, ' ').trim().slice(0, maxLength);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[\p{L}\p{M}' .-]+$/u;

function validateContact(body) {
  const errors = [];
  const firstName = cleanText(body.firstName, 100, false);
  const lastName = cleanText(body.lastName, 100, false);
  const email = cleanText(body.email, 254, false);
  const message = cleanText(body.message, 5000, true);
  const company = cleanText(body.company, 200, false); // honeypot

  if (!firstName || !NAME_RE.test(firstName)) errors.push('firstName');
  if (!lastName || !NAME_RE.test(lastName)) errors.push('lastName');
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) errors.push('email');
  if (!message || message.length < 10) errors.push('message');

  return { errors, isSpam: company.length > 0, data: { firstName, lastName, email, message } };
}

function validateSubscribe(body) {
  const errors = [];
  const email = cleanText(body.email, 254, false);
  const company = cleanText(body.company, 200, false); // honeypot

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) errors.push('email');

  return { errors, isSpam: company.length > 0, data: { email } };
}

async function sendResendEmail({ to, replyTo, subject, html, text }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: CONTACT_FROM_EMAIL,
      to: [to],
      reply_to: replyTo,
      subject,
      html,
      text,
    }),
  });
  if (!response.ok) {
    const errorDetails = await response.text().catch(() => '');
    console.error(`Resend API error (${response.status}):`, errorDetails);
    throw Object.assign(new Error('Resend request failed'), { statusCode: response.status });
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function handleFormSubmission(req, res, scope) {
  if (!isTrustedOrigin(req)) {
    sendJson(res, 403, { ok: false, error: 'Request origin could not be verified.' });
    return;
  }
  if (isRateLimited(scope, getClientIp(req))) {
    sendJson(res, 429, { ok: false, error: 'Too many requests. Please try again later.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, err.statusCode || 400, { ok: false, error: 'Invalid request body.' });
    return;
  }

  const elapsedMs = Number(body.elapsedMs);
  const submittedTooFast = Number.isFinite(elapsedMs) && elapsedMs < MIN_SUBMIT_MS;
  const missingTiming = !Number.isFinite(elapsedMs);

  const { errors, isSpam, data } =
    scope === 'contact' ? validateContact(body) : validateSubscribe(body);

  if (isSpam || submittedTooFast || missingTiming) {
    // Pretend success so bots don't learn the honeypot/timing worked.
    sendJson(res, 200, { ok: true });
    return;
  }

  if (errors.length > 0) {
    sendJson(res, 422, { ok: false, error: 'Please check the highlighted fields.', fields: errors });
    return;
  }

  if (!RESEND_API_KEY) {
    console.error(`[${scope}] RESEND_API_KEY is not configured — cannot send email.`);
    sendJson(res, 500, { ok: false, error: 'Email delivery is not configured yet. Please try again later.' });
    return;
  }

  try {
    if (scope === 'contact') {
      const { firstName, lastName, email, message } = data;
      await sendResendEmail({
        to: CONTACT_TO_EMAIL,
        replyTo: email,
        subject: `New inquiry from ${firstName} ${lastName} — circlescr.com`,
        html: `<p><strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Message:</strong></p><p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`,
        text: `Name: ${firstName} ${lastName}\nEmail: ${email}\n\n${message}`,
      });
    } else {
      const { email } = data;
      await sendResendEmail({
        to: CONTACT_TO_EMAIL,
        replyTo: email,
        subject: 'New newsletter subscriber — circlescr.com',
        html: `<p>New subscriber: <strong>${escapeHtml(email)}</strong></p>`,
        text: `New subscriber: ${email}`,
      });
    }
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error(`[${scope}] Resend request failed with status ${err.statusCode || 'unknown'}.`);
    sendJson(res, 502, { ok: false, error: 'Email service is temporarily unavailable. Please try again shortly.' });
  }
}

function safeParseUrl(req) {
  try {
    const rawHost = req.headers.host;
    const host = typeof rawHost === 'string' && rawHost.trim() ? rawHost.trim() : 'localhost';
    return new URL(req.url, `http://${host}`);
  } catch {
    return null;
  }
}

const compress = compression();

createServer((req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-XSS-Protection', '0');

  const parsedUrl = safeParseUrl(req);
  if (!parsedUrl) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Bad Request');
    return;
  }

  const { pathname } = parsedUrl;

  if (req.method === 'POST' && pathname === '/api/contact') {
    handleFormSubmission(req, res, 'contact');
    return;
  }
  if (req.method === 'POST' && pathname === '/api/subscribe') {
    handleFormSubmission(req, res, 'subscribe');
    return;
  }

  compress(req, res, () => {
    assets(req, res, async () => {
      const localeMatch = pathname.match(LOCALE_PREFIX_RE);
      const notFoundFile = localeMatch
        ? `dist/${localeMatch[1]}/404/index.html`
        : 'dist/404.html';

      res.statusCode = 404;
      try {
        const html = await readFile(notFoundFile, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      } catch {
        res.end('Not found');
      }
    });
  });
}).listen(PORT, () => {
  console.log(`Serving dist on :${PORT}`);
});

