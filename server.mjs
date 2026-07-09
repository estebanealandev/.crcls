import { createServer } from 'node:http';
import sirv from 'sirv';

const PORT = process.env.PORT || 3000;

const SCRIPT_HASHES = [
  "'sha256-kq1Lb01+80kJWgn9PoV2iccjkqy6DSjbWU3gu327N/U='",
  "'sha256-hk/KMO1WfiP6yrutb35AeUg54K7EXW4Gvk6PlsQvGYw='",
  "'sha256-/HLfvflMjGJfNWACtmeM8j985xMVxyR1fLmWYzg3xPs='",
  "'sha256-IFglbyngJ2kIeE41CVjdICsdoq8nnrKI0WKrLmEyiLY='",
  "'sha256-cv7HuQsgHFnTM7nCpiohsAup8X/fMQ5SJOGI0SKs5mc='",
  "'sha256-52UfK89BuAup+nwQESdYTAgEqrKxzGZC7jKMTR0tdho='",
  "'sha256-mTKa2f9NnduJ9f5CiFEUATEPOAkKPlVrXF/itRfN96g='",
  "'sha256-CCSklvsMrBa//Gte6OGcCiW0ZJZzW91TYOnHuVFi2LU='",
  "'sha256-gPM3F0gz0NQDSFAmoV73Gt6b5WY3FtPOKhlNIfQ5qvs='",
  "'sha256-2rN0G+pT+xCjPPtXrIE78Ry087qGpGvGVo8d1uhNmGY='",
  "'sha256-CB4/7KlaD6FZQ3wZgfTP+LJbeiHk2iVMLTZiaZU81Rs='",
  "'sha256-eF/gaAFt0oLquJIoIEvJT+foC/h2RKFsEe4iFEIy7Ng='",
  "'sha256-6FCOzO73y8p36bBvavdkMnWbxtFYRf4ox4kRRIP9A5w='",
  "'sha256-CCvFfdCBqcjvyhyB7smL2zSyksbOm0c8UrfcJj2TIbE='",
  "'sha256-zNLRbCnn04d+UXd2KzfV9w3nROo0qipJhkOLZvUgPXk='",
  "'sha256-61axK/0SND/r+Tk+QinMOoqbmWOmiDZCnZZmRR9jC5U='",
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

createServer((req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-XSS-Protection', '0');
  assets(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
}).listen(PORT, () => {
  console.log(`Serving dist on :${PORT}`);
});
