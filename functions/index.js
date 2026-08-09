/**
 * Form endpoints for circlescr.com, served through Firebase Hosting rewrites:
 *
 *   POST /api/contact    -> contact
 *   POST /api/subscribe  -> subscribe
 *
 * Ported from the previous self-hosted Node server. Behaviour is unchanged:
 * origin verification, in-memory rate limiting, honeypot + timing trap,
 * strict field validation, and delivery through Resend.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'hello@circlescr.com';
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || 'Circles <hello@circlescr.com>';

// Firebase Hosting proxies to Cloud Run, so `Host` is the Cloud Run service
// host rather than the site domain — comparing Origin against Host (as the
// old single-process server did) would always fail here. An explicit
// allowlist is both correct behind the CDN and tighter than a host echo.
// The *.web.app / *.firebaseapp.com entries are the project's own Hosting
// domains, kept so the forms can be exercised before circlescr.com is attached.
// Drop them once the custom domain is the only way in.
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ||
    [
      'https://circlescr.com',
      'https://www.circlescr.com',
      'https://circlescr-web.web.app',
      'https://circlescr-web.firebaseapp.com',
    ].join(','))
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
);

const MAX_BODY_BYTES = 16 * 1024;
const MIN_SUBMIT_MS = 1200; // reject submissions faster than a human could plausibly type
const RATE_LIMITS = {
  contact: { windowMs: 10 * 60 * 1000, max: 5 },
  subscribe: { windowMs: 10 * 60 * 1000, max: 5 },
};

// Per-instance counter. Cloud Run may run several instances, so this is a
// best-effort brake on bursts rather than a global quota — same trade-off the
// previous single-process deployment made. See docs/SECURITY_REPORT.md.
const rateBuckets = new Map(); // `${scope}:${ip}` -> [timestamps]

function getClientIp(req) {
  // Hosting appends its own hop, so the client address is the first entry.
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
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

  // Opportunistic prune: keeps the map from growing unbounded across the
  // lifetime of a warm instance without needing a timer.
  if (rateBuckets.size > 5000) {
    for (const [k, ts] of rateBuckets) {
      const w = RATE_LIMITS[k.split(':')[0]]?.windowMs ?? windowMs;
      if (ts.every((t) => now - t >= w)) rateBuckets.delete(k);
    }
  }
  return false;
}

function isTrustedOrigin(req) {
  const origin = req.headers.origin;
  return typeof origin === 'string' && ALLOWED_ORIGINS.has(origin);
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
      Authorization: `Bearer ${RESEND_API_KEY.value()}`,
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
  res.status(statusCode).set('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(payload));
}

async function handleFormSubmission(req, res, scope) {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!isTrustedOrigin(req)) {
    sendJson(res, 403, { ok: false, error: 'Request origin could not be verified.' });
    return;
  }
  if (req.rawBody && req.rawBody.length > MAX_BODY_BYTES) {
    sendJson(res, 413, { ok: false, error: 'Invalid request body.' });
    return;
  }
  if (isRateLimited(scope, getClientIp(req))) {
    sendJson(res, 429, { ok: false, error: 'Too many requests. Please try again later.' });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sendJson(res, 400, { ok: false, error: 'Invalid request body.' });
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

const options = {
  region: 'us-central1',
  secrets: [RESEND_API_KEY],
  memory: '256MiB',
  timeoutSeconds: 30,
  maxInstances: 10,
  // Invalid/abusive traffic should not be able to spin up capacity beyond
  // what the site's real form volume needs.
  concurrency: 40,
};

export const contact = onRequest(options, (req, res) => handleFormSubmission(req, res, 'contact'));
export const subscribe = onRequest(options, (req, res) => handleFormSubmission(req, res, 'subscribe'));
