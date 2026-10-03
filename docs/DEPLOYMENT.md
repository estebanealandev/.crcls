# Deployment — Firebase Hosting + Cloud Functions

> **Production today is Railway, not Firebase.** `circlescr.com` is still
> served by Railway (behind Cloudflare), which auto-deploys `main` using
> `railway.json` + `railpack.json`: `npm run build`, then `node server.mjs`.
> `server.mjs` sends the security headers, hashes the CSP from the built HTML
> at startup (so it cannot drift), serves `/api/contact` and `/api/subscribe`,
> and 301s the retired `/project/*` URLs. Keep `railway.json`, the `start`
> script and the `sirv`/`compression` dependencies until the domain is moved
> to Firebase: without them Railway falls back to serving `dist/` as a bare
> static site, with no security headers and no form endpoints.
> Everything below describes the Firebase target (`circlescr-web.web.app`).

Target infrastructure for circlescr.com. Supersedes everything in
[`docs/archive/`](archive/), which describes the previous self-hosted Node
deployment.

## Shape

| Piece | Where it runs |
| --- | --- |
| 75 prerendered pages (5 locales) | Firebase Hosting CDN, from `dist/` |
| Security headers + cache policy | `firebase.json` → `hosting.headers` |
| `POST /api/contact` | Cloud Function `contact` (2nd gen, Node 22) |
| `POST /api/subscribe` | Cloud Function `subscribe` (2nd gen, Node 22) |
| Outbound email | Resend API |

Astro builds with `output: 'static'` — there is no SSR adapter and none is
needed. The only server-side code is the two form handlers in `functions/`.

## Project

| | |
| --- | --- |
| Project ID | `circlescr-web` |
| Display name | circlescr |
| Default domain | https://circlescr-web.web.app |
| Console | https://console.firebase.google.com/project/circlescr-web |

The bare ID `circlescr` was already taken — project IDs are unique across all
of Google Cloud, not just one account. Once `circlescr.com` is attached as a
custom domain the ID is effectively invisible.

## One-time setup

1. ~~Create the Firebase project.~~ Done — `circlescr-web`, already set in
   `.firebaserc`. Hosting is deployed and live.

2. ~~Upgrade to the Blaze plan.~~ Done. Both functions are deployed and live.

3. ~~Store the Resend key in Secret Manager.~~ Done — `RESEND_API_KEY`
   version 1, verified end to end with a real send through both endpoints.

   To rotate it later:

   ```bash
   firebase functions:secrets:set RESEND_API_KEY
   firebase deploy --only functions
   ```

   Note `functions/.secret.local` is read **only by the emulator** — it is
   gitignored and never deployed. Production reads Secret Manager.

4. **Connect the custom domain** in Firebase Console → Hosting → Add custom
   domain. Firebase provisions and renews the TLS certificate automatically.
   Add `www.circlescr.com` as a redirect to the apex if you want a single
   canonical host.

## Deploying

```bash
npm run deploy           # build + integrity check + hosting & functions
npm run deploy:hosting   # build + integrity check + hosting only
```

`npm run deploy` runs `npm run build` (which regenerates the CSP hashes) and
`npm run check` (which validates all 75 pages, links, assets, hreflang,
canonicals, JSON-LD and the sitemap) before anything is uploaded. A broken
build cannot reach production.

## Local development

```bash
npm run dev     # Astro dev server, no functions
npm run build   # produce dist/ and refresh the CSP
npm run serve   # Firebase emulators: hosting + functions, http://127.0.0.1:5000
```

The emulator reads `functions/.secret.local` for `RESEND_API_KEY` (gitignored).
Because the emulator serves from `http://localhost:5000`, the functions' origin
allowlist has to be widened for local form testing:

```bash
ALLOWED_ORIGINS=http://localhost:5000 npm run serve
```

## Content Security Policy

The CSP lives in `firebase.json`, and its inline-script `sha256-` hashes are
**generated, not hand-maintained**. `scripts/gen-csp.mjs` runs as part of
`npm run build`: it walks every built HTML file, hashes each executable inline
script, and rewrites the `script-src` directive in place.

This replaces the previous startup-time hashing that the Node server did.
Firebase Hosting headers are static configuration, so the hashes must be baked
in at build time — but the generator means a change to any inline script still
cannot silently drift out of sync with the policy. `<script type="application/
ld+json">` blocks are skipped, since CSP `script-src` does not apply to them.

If you add a third-party script, add its origin to the `script-src` /
`connect-src` lists in `firebase.json` by hand; the generator only manages the
hash entries and leaves every other source untouched.

## Cache policy

| Path | `Cache-Control` |
| --- | --- |
| HTML pages (default for `**`) | `no-cache` — revalidate every request, so deploys propagate instantly |
| `/_astro/**`, `/js/webflow.<hash>.js` | `public, max-age=31536000, immutable` — content-hashed filenames |
| `/assets/fonts/**` | `public, max-age=31536000, immutable` |
| `/assets/{images,videos,lotties}/**` | `public, max-age=86400, must-revalidate` |
| `/js/*.js` (non-hashed) | `public, max-age=3600, must-revalidate` |
| `robots.txt`, `sitemap.xml` | `public, max-age=3600, must-revalidate` |

The `no-cache` default matters: Firebase's own fallback is `max-age=3600`, and
Hosting header globs match **URL paths**, not file paths. A rule written as
`**/*.html` never matches directory-style URLs like `/` or `/es/about/`, which
is how Astro emits every page here — so HTML must get its policy from the
catch-all `**` block, with the asset rules overriding it further down the list.

## 404 handling

Firebase Hosting supports exactly one custom 404 document, so all five locales
are answered by `dist/404.html` with a correct `404` status. To keep the
localized experience, `src/templates/NotFoundPage.astro` embeds a small table of
the translated strings and relabels the page from the URL's locale prefix on
load. Status codes stay correct — nothing is redirected — and the page is
`noindex`, so there is no SEO consequence.

## Known limitations

- **Rate limiting is per-instance.** `functions/index.js` keeps its counters in
  memory, so the 5-per-10-minutes limit is enforced per warm Cloud Run instance
  rather than globally (`maxInstances` is capped at 10 to bound this). This is
  the same trade-off the previous single-process deployment made. If form spam
  becomes a real problem, move the counters to Firestore or Redis.
- **`X-Frame-Options` and CSP `frame-ancestors` are both set.** Redundant by
  design: `frame-ancestors` is the modern control, `X-Frame-Options` is kept for
  older user agents.
