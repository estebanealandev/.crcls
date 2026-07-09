import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import sirv from 'sirv';
import compression from 'compression';

const PORT = process.env.PORT || 3000;
const LOCALE_PREFIXES = ['es', 'fr', 'de', 'pt'];
const LOCALE_PREFIX_RE = new RegExp(`^/(${LOCALE_PREFIXES.join('|')})(/|$)`);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'hello@circlescr.com';
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || 'Circles <hello@circlescr.com>';

const SCRIPT_HASHES = [
  "'sha256-+zokMPH3KfV2XKAry/mw1pfn3KsbrjdoLwWTMG0SHOk='",
  "'sha256-1zlmzh58m5a9/55ekVwjrSI56asQCcTfMXD/M8jZnco='",
  "'sha256-3X2w7C9u77/eaGBbmmoR3VgH4f6y7Xludz3F4X3mf9I='",
  "'sha256-3XQPlAspp/VYrkKicQ6nQGDU66jDwpnB4LER91ixQa4='",
  "'sha256-7OBXxHEIWvzz3CPvyTn37nL5WJlgerErpoa7aBcQQmc='",
  "'sha256-7lL7Q47mZ1NNVllE2mq8XrcCfUJitUsbPQm3kZfToXo='",
  "'sha256-BhZBwkFoGhwlkZ4WSmEh6RJe5PZRbuqcu296YwPbY/Y='",
  "'sha256-BvrPyvO5lXaYZG+As3tRqr8pC9PEbLvnBqsF088Hipo='",
  "'sha256-Ir68yWyMEAlvA05EyvYv+4SIK+3hgTzKW4HBO9HOZKk='",
  "'sha256-JvS4YS3Ko58G2lp0hrdmht24miTbEJCGo9xnhJGJHc8='",
  "'sha256-R9QTmnpDvfpI6/EHHcvGNyCw06lYOP4lB/5rQ7ZNd9A='",
  "'sha256-T3EtpoVjtrAVsRxhNLGezvCp4Q8Z5Bgin73c+iyFBFg='",
  "'sha256-Tza0uoTv+PBWXXdGVm3ZLMmG3qSSyX3dODhIpMcZ+SU='",
  "'sha256-V9SZ7X1l3+utQzTUIJhiaa2L8u3jdEt3xRm0z4EpD/Y='",
  "'sha256-ikemCEw1D+VaYBleAUR/b6XbDPYYspvpHuAbuour9Hc='",
  "'sha256-kq1Lb01+80kJWgn9PoV2iccjkqy6DSjbWU3gu327N/U='",
  "'sha256-wWCf7aNqP4dMDFL+3JKRmwP50HSKkxt4EGr769FNP/g='",
];

const CSP = [
  "default-src 'self'",
  `script-src 'self' ${SCRIPT_HASHES.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "media-src 'self' data: https://videos.pexels.com",
  "connect-src 'self'",
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
    } else if (pathname.endsWith('.html') || pathname === '/') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  },
});

// ---- Form endpoint support (Resend) ----

const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMITS = {
  contact: { windowMs: 10 * 60 * 1000, max: 5 },
  subscribe: { windowMs: 10 * 60 * 1000, max: 5 },
};
const rateBuckets = new Map(); // `${scope}:${ip}` -> [timestamps]
const MIN_SUBMIT_MS = 1200; // reject submissions faster than a human could plausibly type

function getClientIp(req) {
  // Railway (and most PaaS) terminate TLS at a proxy and set x-forwarded-for.
  // Trust only the first hop, since we don't control what's further upstream.
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(scope, ip) {
  const { windowMs, max } = RATE_LIMITS[scope];
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= max) {
    rateBuckets.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return false;
}

// Rate-limit map only grows with distinct IPs; prune stale entries periodically
// so a long-running process doesn't accumulate unbounded memory.
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateBuckets) {
    const scope = key.split(':')[0];
    const windowMs = RATE_LIMITS[scope]?.windowMs ?? 10 * 60 * 1000;
    const fresh = timestamps.filter((t) => now - t < windowMs);
    if (fresh.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, fresh);
  }
}, 15 * 60 * 1000).unref();

function isTrustedOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Strips control characters (including CR/LF, which could otherwise be used
// for header/content injection) and trims to a sane max length.
function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, maxLength);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[\p{L}\p{M}' .-]+$/u;

function validateContact(body) {
  const errors = [];
  const firstName = cleanText(body.firstName, 100);
  const lastName = cleanText(body.lastName, 100);
  const email = cleanText(body.email, 254);
  const message = cleanText(body.message, 5000);
  const company = cleanText(body.company, 200); // honeypot

  if (!firstName || !NAME_RE.test(firstName)) errors.push('firstName');
  if (!lastName || !NAME_RE.test(lastName)) errors.push('lastName');
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) errors.push('email');
  if (!message || message.length < 10) errors.push('message');

  return { errors, isSpam: company.length > 0, data: { firstName, lastName, email, message } };
}

function validateSubscribe(body) {
  const errors = [];
  const email = cleanText(body.email, 254);
  const company = cleanText(body.company, 200); // honeypot

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

  const { errors, isSpam, data } =
    scope === 'contact' ? validateContact(body) : validateSubscribe(body);

  if (isSpam || submittedTooFast) {
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

const compress = compression();

createServer((req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-XSS-Protection', '0');

  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

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
      const { pathname } = new URL(req.url, `http://${req.headers.host}`);
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
