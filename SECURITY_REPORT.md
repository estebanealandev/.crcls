# SECURITY_REPORT — Circles website

Fecha: 2026-07-11. Complementa el audit previo (`SECURITY-AUDIT.md`, 2026-07-09), cuyos headers/CSP ya estaban implementados; este pase los valida y endurece los huecos restantes.

## 1. Threat model y superficie de ataque

Sitio estático de agencia (80 páginas prerenderizadas) servido por un proceso Node propio (`server.mjs`: sirv + compression) en Railway, con **dos endpoints POST** (`/api/contact`, `/api/subscribe`) que reenvían por Resend. Sin autenticación, sin sesiones, sin base de datos, sin cookies.

Superficie real:
1. **Endpoints de formulario** — spam/abuso, inyección en el email saliente, exfiltración de la API key.
2. **XSS/inyección en HTML generado** — vía `set:html` o contenido no confiable.
3. **Supply chain** — dependencias npm + los bundles JS estáticos del runtime.
4. **Headers/transporte** — clickjacking, MIME sniffing, referrer leakage.

No aplican: CSRF clásico (no hay sesión que montar; aún así el server verifica `Origin`==`Host`), CORS (no expone API cross-origin), y controles de app autenticada.

## 2. Estado de los controles (validados en este pase)

| Control | Estado | Detalle |
|---|---|---|
| CSP | ✅ endurecida | `default-src 'self'`; script-src por **hashes sha256 autogenerados** (ver §3); `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'none'`, `upgrade-insecure-requests`. Único tercero permitido: `media-src https://videos.pexels.com` (vídeo del proyecto aether). `style-src 'unsafe-inline'` permanece (estilos inline del export; riesgo bajo al no haber inyección de contenido de usuario). |
| HSTS | ✅ | `max-age=31536000; includeSubDomains; preload` |
| X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy | ✅ | `nosniff` / `DENY` / `strict-origin-when-cross-origin` / cámara, micro, geo, pago y USB denegados |
| Anti-spam formularios | ✅ (previo) | Honeypot + umbral de tiempo mínimo + rate-limit por IP (5/10 min, con poda periódica del mapa) + verificación de Origin + límite de body 16 KB. Respuesta 200 fake ante spam para no entrenar bots. |
| Secretos | ✅ | `RESEND_API_KEY` solo en runtime del servidor (Railway Variables); `.env*` en `.gitignore`; grep de credenciales en `src/`/`public/`: limpio. No hay secretos en bundles. |
| Sanitización email saliente | ✅ (previo) | `escapeHtml` sobre todos los campos interpolados en el HTML del email. |
| XSS en templates | ✅ endurecido | Único uso de `set:html` es JSON-LD; ahora pasa por `jsonLdString()` que escapa `<` → `<`, eliminando el vector teórico de cierre `</script>` si algún texto de locale lo contuviera. Astro escapa por defecto todo lo demás; `RichText` no usa HTML crudo. |
| Reverse tabnabbing | ✅ (previo) | Todos los `target="_blank"` llevan `rel="noopener noreferrer"`. |
| Source maps públicos | ✅ | No se emiten `.map` en `dist/`. |

## 3. Cambios de hardening en este pase

1. **CSP sin drift**: los 17 hashes hardcodeados se sustituyen por un escaneo de `dist/**/*.html` al arrancar el servidor, que hashea solo los `<script>` inline **ejecutables** (excluye `application/ld+json`, que CSP no evalúa). Resultado: 1 hash (el IIFE de detección táctil). Cualquier cambio futuro de scripts inline queda cubierto automáticamente; antes, un cambio silencioso habría roto la página o dejado hashes obsoletos acumulados.
2. **Bug de caché en HTML corregido**: las páginas servidas como directorio (`/es/about/`) caían al bucket genérico `max-age=3600`; ahora todo documento HTML (`/`, `/ruta/`, `/ruta`, `*.html`) es `no-cache` (revalidación en cada request → los deploys propagan de inmediato). Assets con hash: `immutable, 1 año`; `/assets/` (fuentes/imágenes/vídeos): 1 día.
3. **JSON-LD blindado** (`jsonLdString`, ver tabla).
4. Eliminación de superficie muerta: `webfont.js` (loader remoto de fuentes sin uso), `i18n-locale.js` (redirector no conectado), 33 assets huérfanos.

## 4. Dependencias y supply chain

- **Producción** (`astro`, `compression`, `sirv`): `npm audit --omit=dev` → **0 vulnerabilidades**. Todas en última versión estable (astro 7.0.7, compression 1.8.1, sirv 3.0.2).
- **Desarrollo**: 17 vulnerabilidades *moderate*, todas transitivas de `lighthouse@13.4.0 → @sentry/node → @opentelemetry/*`. Lighthouse ya está en su última versión; no existe fix upstream hoy. **Riesgo residual aceptado y acotado**: solo se ejecuta en la máquina de desarrollo, nunca en producción ni en el build desplegado. Revisar en el próximo release de Lighthouse.
- Eliminado `wawoff2` (devDep sin ningún uso — herramienta puntual de conversión de fuentes ya consumida).
- Override existente `esbuild ^0.25.0` conservado (mitigación previa).
- Lockfile consistente (`npm ci` reproducible). Sin scripts de instalación sospechosos en el árbol (`npm query ":attr(scripts, [preinstall]), :attr(scripts, [postinstall])"` — solo esbuild/sharp estándar).
- Los bundles de `public/js/` (runtime de interacciones, GSAP, jQuery 3.5.1) son estáticos y auto-hosteados — sin CDN de terceros ni SRI necesario. jQuery 3.5.1 no tiene CVEs conocidos aplicables a este uso (no se usa jQuery en código propio; el runtime lo consume internamente con datos no controlados por el usuario).

## 5. Riesgos residuales

1. `style-src 'unsafe-inline'` — necesario por los estilos inline del export. Mitigado por la ausencia de inyección de contenido dinámico. Ruta futura: migrar estilos inline a clases y endurecer.
2. Vulnerabilidades moderate dev-only en la cadena de Lighthouse (ver §4).
3. Vídeo de terceros `videos.pexels.com` (proyecto aether): dependencia externa de disponibilidad y privacidad (IP del visitante expuesta a Pexels al reproducir). Recomendación: auto-hostearlo como los demás vídeos.
4. El runtime de interacciones (2 MB de JS heredado) es código opaco minificado; se sirve self-hosted e inmutable, pero conviene tenerlo presente como deuda.
5. Los datos de negocio en el JSON-LD (`StructuredData.astro`: teléfono, dirección, horario, métodos de pago) provienen del contenido existente del proyecto — verificar su exactitud es responsabilidad del propietario.

## 6. Dónde viven los headers

En `server.mjs` (el proceso Node es el edge real en Railway — no hay CDN delante). Si en el futuro se migra a un hosting estático/CDN (Netlify/Vercel/Cloudflare), los headers y los endpoints de formulario deben migrarse a la plataforma (headers de plataforma + functions), y entonces sí procedería eliminar `server.mjs`, `sirv` y `compression`.
