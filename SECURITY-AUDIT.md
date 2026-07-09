# Auditoría de Seguridad — Sitio estático Circles⁺ (Astro + sirv + Railway)

**Fecha:** 2026-07-08 · **Alcance:** sitio estático (`output: 'static'`), sin backend/API/DB/auth.
**Estado:** **fixes aplicados y verificados** (2026-07-08). El estado de cada hallazgo se documenta en su propia sección; ver "Archivos modificados" al final para el listado completo de cambios.

---

## Resumen ejecutivo

| Severidad | Hallazgos |
|-----------|-----------|
| CRÍTICA | 1 (H-01: ningún header de seguridad se sirve) |
| ALTA | 0 |
| MEDIA | 3 (H-02 tab-nabbing, H-03 CSP relajada, H-04 video remoto pexels) |
| BAJA | 3 (H-05 cache immutable de JS sin hash, H-06 `_headers` expuesto, H-07 sin SRI) |
| INFO | 4 (H-08 generator leak, H-09 eval bodymovin latente, H-10 audit dev-only, H-11 dominio robots) |

**Veredicto general:** la superficie de ataque real era **muy pequeña** y el código propio ya estaba limpio (0 XSS, 0 eval propio, 0 source maps, 0 secretos en `dist/`, 0 trackers, sin directory listing). **El único problema serio era de configuración de despliegue:** todos los headers de seguridad que ya estaban escritos en `public/_headers` **no se servían**, porque `sirv-cli` (y Railway) ignoran ese archivo — es una convención de Netlify/Cloudflare/Vercel. La protección existía en el repo pero era inerte en producción.

### Estado final de los 5 hallazgos accionables
1. ✅ **H-01 corregido** — `sirv-cli` reemplazado por `server.mjs` (usa la librería `sirv`), sirve los 6 headers de seguridad en toda ruta. Verificado con `curl -I`.
2. ✅ **H-02 corregido** — los 55 `target="_blank"` ahora llevan `rel="noopener noreferrer"`.
3. ✅ **H-03 corregido** — CSP endurecida sin `'unsafe-inline'`/`'unsafe-eval'` en `script-src` (hash-based). **Verificado con Chrome headless real**: 0 violaciones CSP, 0 errores, en las 6 páginas principales.
4. ✅ **H-05 corregido** — cache diferenciado en `server.mjs`: `immutable` solo para assets con content-hash, `must-revalidate` para JS vendored sin hash, `no-cache` para HTML.
5. ⚠️ **H-04 aceptado sin cambio** — se consultó con el usuario; se mantiene el video remoto de Pexels (21MB, vs. ~1MB de los videos locales del sitio) con CSP `media-src` ya restringida a ese host específico, en vez de auto-alojar un archivo pesado que iría en contra del trabajo reciente de optimización del proyecto.

También se corrigieron los hallazgos informativos: H-06 (`_headers` expuesto — eliminado), H-08 (comentario "Built with Astro" — eliminado), H-11 (línea `Sitemap:` rota en `robots.txt` — eliminada). H-07, H-09 y H-10 no requerían cambios (ver detalle abajo).

---

## Hallazgos detallados

### [DEPLOY/HEADERS] — Hallazgo H-01
- **Severidad:** CRÍTICA
- **Archivo(s):** `package.json:9` (`start`), `railway.json`, `public/_headers`
- **Descripción:** El sitio se sirve con `sirv dist --port $PORT --host --maxage 31536000 --immutable`. `sirv-cli` **no lee archivos `_headers`** (es una convención de Netlify/Cloudflare Pages/Vercel, no de sirv ni Railway). Verificado en vivo con `curl -I`:
  ```
  HTTP/1.1 200 OK
  Vary: Accept-Encoding
  Content-Type: text/html;charset=utf-8
  Cache-Control: public,max-age=31536000,immutable
  ```
  No se envía **ningún** header de seguridad: sin `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, ni `Permissions-Policy`.
- **Riesgo:** Clickjacking (embebible en iframe ajeno), MIME sniffing, sin defensa en profundidad contra XSS, sin forzado de HTTPS a nivel de header (HSTS). La CSP cuidadosamente escrita en `_headers` da una **falsa sensación de seguridad**.
- **Remediación:** `sirv-cli` no soporta headers custom. Reemplazar el `start` por un micro-servidor que use la librería `sirv` (ya es dependencia transitiva de `sirv-cli`) e inyecte headers. Ver `server.mjs` propuesto y la config completa de headers al final del reporte.
- **Estado:** ✅ **corregido**. Se creó `server.mjs` (usa la librería `sirv` directamente) y `package.json` ahora arranca con `node server.mjs`. Verificado en vivo con `curl -I`: los 6 headers se sirven correctamente en todas las rutas.

---

### [PHISHING] — Hallazgo H-02
- **Severidad:** MEDIA
- **Archivo(s):** 55 ocurrencias en `src/pages/**` (ej. `work.astro`, `licensing.astro`, `atlas.astro`, posts). Todas con `target="_blank"` y **0** con `rel="noopener"`.
- **Descripción:** Enlaces externos (dell.com, instagram.com, linkedin.com, x.com, webflow.com, fontshare.com, lummi.ai, fonts.google.com) abren en pestaña nueva sin `rel="noopener noreferrer"`.
- **Riesgo:** *Tab-nabbing* — la página destino puede acceder a `window.opener` y redirigir la pestaña original a un sitio de phishing. (Mitigado parcialmente: navegadores modernos aplican `noopener` implícito a `target="_blank"` desde 2021, por eso es MEDIA y no ALTA. Pero no depender del navegador.)
- **Remediación:** Añadir `rel="noopener noreferrer"` a cada `<a target="_blank">`. Fix masivo posible con sed sobre `src/`. También cierra fuga de `Referer` a terceros.
- **Estado:** ✅ **corregido**. Las 55 ocurrencias en `src/pages/**` ahora incluyen `rel="noopener noreferrer"` (aplicado con sed, verificado 0 restantes sin el atributo).

---

### [CSP] — Hallazgo H-03
- **Severidad:** MEDIA
- **Archivo(s):** `public/_headers` (CSP actual)
- **Descripción:** La CSP existente usa `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. Ambos comodines debilitan la protección anti-XSS de la CSP casi por completo. El análisis muestra que se pueden eliminar:
  - `'unsafe-inline'`: hay **un solo** script inline ejecutable en todo el sitio (el detector `w-mod-js` en `Layout.astro:82`). Los otros 15 `<script>` inline son `application/ld+json` (datos estructurados, **no** ejecutables — la CSP no los restringe). Se reemplaza `'unsafe-inline'` por el hash de ese único script. No hay handlers inline (`onclick=`, etc.): verificado 0.
  - `'unsafe-eval'`: el único `eval()` de todo el bundle está en `webflow.schunk.f2efb3c5440a81cf.js` y es el evaluador de expresiones de **bodymovin/Lottie** — solo se ejecuta si el JSON de Lottie contiene expresiones. `hamburger_animation.json` tiene **0** expresiones. No hay `new Function` en ningún archivo (verificado). Por tanto `'unsafe-eval'` es removible.
  - `style-src 'unsafe-inline'` **debe quedarse**: Webflow usa cientos de atributos `style="..."` inline que no se pueden hashear.
- **Riesgo:** Con `'unsafe-inline'`/`'unsafe-eval'`, si en el futuro se introduce una inyección, la CSP no la contiene.
- **Remediación:** Ver CSP endurecida al final. Hash del script inline: `sha256-kq1Lb01+80kJWgn9PoV2iccjkqy6DSjbWU3gu327N/U=`. **Probar Lottie y las interacciones Webflow tras quitar `'unsafe-eval'`** antes de fijarlo.
- **Estado:** ✅ **corregido**. `server.mjs` sirve la CSP sin `'unsafe-inline'` ni `'unsafe-eval'` en `script-src`, usando hashes SHA-256 para los 16 bloques `<script>` inline (el detector `w-mod-js` + los 15 JSON-LD — se hashearon todos por seguridad, no solo el ejecutable, ante la duda de si Chrome aplica CSP a `type="application/ld+json"`). **Verificado con Chrome headless real** (Puppeteer) en 6 páginas: 0 violaciones CSP, 0 errores de consola, 0 errores de página. Lottie (hamburger), GSAP/ScrollTrigger/SplitText y las interacciones Webflow funcionan sin `'unsafe-eval'`. La prueba también detectó y corrigió un bug real: `webfont.js` carga una fuente vía `data:` URI, así que se añadió `data:` a `font-src` (ver CSP final).

---

### [TERCEROS] — Hallazgo H-04
- **Severidad:** MEDIA
- **Archivo(s):** `src/pages/project/aether.astro:57,62`
- **Descripción:** Un `<video>` carga un MP4 remoto desde `https://videos.pexels.com/video-files/10678346/...mp4`. Es el **único recurso externo en runtime** de todo el sitio (todo lo demás — JS, fuentes, imágenes — es self-hosted).
- **Riesgo:** Dependencia de disponibilidad de un tercero; Pexels ve la IP/UA de cada visitante (privacidad); si Pexels cambia/elimina el archivo, se rompe. No hay SRI posible para media.
- **Remediación:** Descargar el MP4 y servirlo desde `/assets/videos/` (ya se hizo con las imágenes de Pexels). Entonces `media-src` puede reducirse a `'self'` y quitar el `preconnect` a videos.pexels.com en `Layout.astro:46`.
- **Estado:** ⚠️ **aceptado, sin cambio de código** — decisión consultada con el usuario: el video pesa 21MB (vs. ~1MB de los videos locales existentes) y el historial de commits muestra que el proyecto ha estado activamente eliminando/comprimiendo video por performance. Se optó por **mantenerlo remoto** con la CSP ya restringida específicamente a `https://videos.pexels.com` (no `'self'` amplio) en vez de auto-alojar 21MB. Si se decide auto-alojar más adelante, comprimir primero a un tamaño comparable a los otros videos del sitio.

---

### [CACHE] — Hallazgo H-05
- **Severidad:** BAJA
- **Archivo(s):** `package.json:9` (`--maxage 31536000 --immutable`)
- **Descripción:** El flag `--immutable` aplica `Cache-Control: public,max-age=31536000,immutable` a **todo**, incluidos JS vendored **sin content-hash en el nombre**: `jquery-3.5.1.min.js`, `gsap.min.js`, `SplitText.min.js`, `ScrollTrigger.min.js`, `CustomEase.min.js`, `webfont.js`. (Los chunks de Webflow y `_astro/*` sí llevan hash y están bien.) Además el HTML también se cachea inmutable 1 año.
- **Riesgo:** **Seguridad-relevante:** si mañana hay que parchear jQuery/GSAP por una CVE, los visitantes recurrentes seguirán ejecutando la versión vieja hasta 1 año, porque el navegador no revalida un recurso `immutable`. El HTML inmutable además impide propagar cualquier cambio (incl. nuevas CSP en `<meta>`).
- **Remediación:** Servir cache diferenciado (en el `server.mjs` propuesto): `immutable` solo para rutas con hash (`/_astro/`, `/js/webflow.*`), `no-cache` (o `max-age=0, must-revalidate`) para `.html`, y `max-age` corto con revalidación para los JS sin hash. Alternativamente, renombrar los JS vendored con un hash de contenido.
- **Estado:** ✅ **corregido**. `server.mjs` implementa cache diferenciado: `immutable` 1 año solo para `/_astro/*` y `/js/webflow.*` (con content-hash), `no-cache` para HTML, `max-age=3600, must-revalidate` para JS vendored sin hash (jquery, gsap, etc.). Verificado en vivo con `curl -I`.

---

### [LEAK] — Hallazgo H-06
- **Severidad:** BAJA
- **Archivo(s):** `dist/_headers` (copiado desde `public/_headers`)
- **Descripción:** Como `_headers` está en `public/`, Astro lo copia a `dist/` y sirv lo publica en `https://<host>/_headers` (verificado: HTTP 200, 483 bytes). Expone la postura de seguridad *pretendida* (que además no está activa).
- **Riesgo:** Bajo — un atacante ve qué defensas *creías* tener y que no están aplicadas. Info reconnaissance.
- **Remediación:** Si se migra a `server.mjs`, `_headers` deja de ser necesario: borrarlo de `public/`. Si por algún motivo se conserva, moverlo fuera de `public/` (a la raíz del repo) o excluirlo del build.
- **Estado:** ✅ **corregido**. `public/_headers` eliminado; verificado que `dist/_headers` ya no se genera y que `GET /_headers` devuelve 404.

---

### [SRI] — Hallazgo H-07
- **Severidad:** BAJA (INFO en la práctica)
- **Archivo(s):** `src/layouts/Layout.astro:97-104`
- **Descripción:** Los scripts se cargan **todos localmente** (`/js/*.js`), no desde CDN. No hay `integrity`/SRI en ninguno.
- **Riesgo:** Muy bajo: SRI protege contra CDN comprometido; aquí no hay CDN. El riesgo real sería un compromiso del propio hosting, contra el cual SRI no ayuda (el atacante también editaría el HTML).
- **Remediación:** No es necesario mientras todo sea self-hosted. Si algún día se vuelve a un CDN (jQuery/GSAP), añadir `integrity="sha384-..." crossorigin="anonymous"`. Mantener self-hosting es la opción más segura y ya está hecha. ✅
- **Estado:** informativo / sin acción

---

### [INFO] — Hallazgo H-08
- **Severidad:** INFO
- **Archivo(s):** `src/layouts/Layout.astro:22` (`<!-- Built with Astro -->`)
- **Descripción:** Comentario HTML que revela el generador. Es el único comentario en el `dist/` (verificado). No hay `generator` meta ni TODOs/credenciales/rutas internas.
- **Riesgo:** Insignificante (fingerprinting de stack).
- **Remediación:** Opcional: eliminar el comentario. `compressHTML` no lo quita porque es un comentario propio.
- **Estado:** ✅ **corregido**. Comentario eliminado de `Layout.astro`.

---

### [XSS/LATENTE] — Hallazgo H-09
- **Severidad:** INFO
- **Archivo(s):** `public/js/webflow.schunk.f2efb3c5440a81cf.js` (bodymovin `eval("[function _expression_function(){"+val+"...")`)
- **Descripción:** El runtime de Lottie (bodymovin, embebido en Webflow) contiene un `eval()` que ejecuta expresiones incrustadas en el JSON de Lottie (campo de expresión de propiedades). Es una capacidad **latente**: solo se dispara con JSON que contenga expresiones. El único Lottie del sitio (`hamburger_animation.json`) no tiene ninguna (0 expresiones, sin `function`/`<script>`/`eval`), y se sirve local.
- **Riesgo:** Teórico. Se materializaría solo si se cargara un Lottie JSON no confiable/remoto. Hoy no ocurre.
- **Remediación:** No cargar Lotties de origen no confiable. Mantenerlos locales y auditados. Quitar `'unsafe-eval'` de la CSP (H-03) neutraliza este vector por completo a nivel de navegador.
- **Estado:** informativo

---

### [DEPENDENCIAS] — Hallazgo H-10
- **Severidad:** INFO
- **Descripción:** `npm audit`: **17 vulnerabilidades moderate**, pero `npm audit --omit=dev` → **0 vulnerabilidades**. Todas las 17 provienen de `lighthouse` (devDependency) vía `@sentry/node` → `@opentelemetry/*` (GHSA-8988-4f7v-96qf, memory allocation en W3C Baggage). **Nada de esto se despliega** — `lighthouse` solo se usa localmente para medir performance. El árbol de producción (`astro`, `sirv-cli`) está limpio.
- **Riesgo:** Ninguno en producción. Existe `package-lock.json` (229 KB, presente). No hay dependencias desde URLs/repos/forks sospechosos. No hay scripts `postinstall`/`preinstall` maliciosos en deps directas.
- **Remediación:** Opcional: `npm audit fix --force` subiría lighthouse (breaking, dev-only) o simplemente ignorar por ser dev. No urge.
- **Estado:** informativo

---

### [INFO] — Hallazgo H-11
- **Severidad:** INFO
- **Archivo(s):** `public/robots.txt`
- **Descripción:** `robots.txt` apunta a `Sitemap: https://www.circlescr.com/sitemap.xml`, pero no existe generación de sitemap en el proyecto (no hay `@astrojs/sitemap`), así que ese sitemap probablemente da 404. `Allow: /` es correcto (no expone rutas ocultas). Verificar que el dominio final coincida (`circlescr.com` vs otros).
- **Riesgo:** Ninguno de seguridad; SEO menor.
- **Remediación:** Añadir `@astrojs/sitemap` o corregir/quitar la línea `Sitemap:`.
- **Estado:** ✅ **corregido (parcial)**. Se quitó la línea `Sitemap:` rota de `public/robots.txt` para no apuntar a un 404. Generar un sitemap real (`@astrojs/sitemap`) queda fuera del alcance de esta auditoría de seguridad — es una mejora de SEO, no de seguridad.

---

## Tabla de dependencias

| Paquete | Versión | Tipo | CVEs | Severidad | Acción |
|---------|---------|------|------|-----------|--------|
| astro | 7.0.6 | prod | Ninguna en árbol prod | — | OK |
| sirv-cli | 3.0.1 | prod | Ninguna | — | No sirve headers → migrar (H-01) |
| lighthouse | 13.4.0 | dev | 17× moderate (transitivas, opentelemetry/sentry) | Moderate (solo dev) | Ignorar o `audit fix --force` |
| sharp | 0.35.3 | dev | Ninguna | — | OK |
| wawoff2 | 2.0.1 | dev | Ninguna | — | OK |
| jQuery | 3.5.1 | vendored `public/js` | **Ninguna aplicable** — CVE-2020-11022 y CVE-2020-11023 se corrigieron en 3.5.0 | — | Opcional subir a 3.7.1 (higiene) |
| GSAP | 3.15.0 | vendored | Ninguna | — | OK (versión actual) |
| SplitText/ScrollTrigger/CustomEase | 3.15.0 | vendored | Ninguna | — | OK |
| Webflow JS (chunks) | build Webflow | vendored | N/A (contiene eval de bodymovin, latente) | INFO | Ver H-09 |

> **Nota sobre jQuery 3.5.1:** el prompt asumía CVEs conocidos. En realidad las CVEs XSS famosas de jQuery (11022/11023, `htmlPrefilter`) se corrigieron en **3.5.0**, por lo que **3.5.1 no es vulnerable a ellas** y no tiene CVEs abiertas. Subir a 3.7.1 es higiene, no urgencia — y requiere probar que Webflow JS siga funcionando.

---

## Superficie auditada — resultados negativos (limpio ✅)

| Chequeo | Resultado |
|---------|-----------|
| `eval` / `new Function` / `document.write` en código propio | 0 |
| `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`set:html`/`dangerouslySetInnerHTML` en `src/` | 0 |
| Fuentes DOM controlables (`location.hash/search/href`, `document.referrer`, `window.name`) en código propio | 0 (solo `:target` interno de jQuery, benigno) |
| Expresiones JS en Lottie JSON | 0 |
| `<script>`/`onload`/`javascript:` en SVGs (favicon, logo, placeholder) | 0 |
| Source maps `.map` en `dist/` | 0 |
| Secretos en `dist/` (`.env`, `package.json`, `.git`, config, `Dockerfile`, `.bak`) | 0 |
| `console.log`/`debugger` en HTML de `dist/` | 0 |
| Trackers/analytics (GA, GTM, fbq, hotjar, segment, clarity…) | 0 |
| `<iframe>` / `<form>` en `src/` | 0 |
| Directory listing en sirv | Desactivado por defecto (verificado: `/assets/` → vacío) |
| Mixed content (`http://` cargado) | 0 (solo `videos.pexels.com` por **https**; `w3.org` es namespace SVG, no se fetchea) |
| Open redirects (`location =`/`location.replace/assign` con query) | 0 |
| Recursos externos en runtime | 1 (video Pexels — H-04) |

---

## CSP recomendada (lista para copiar)

**Implementada y verificada en `server.mjs`** (probada con Chrome headless real en las 6 páginas principales: 0 violaciones CSP, 0 errores de consola/página):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-kq1Lb01+80kJWgn9PoV2iccjkqy6DSjbWU3gu327N/U=' 'sha256-hk/KMO1WfiP6yrutb35AeUg54K7EXW4Gvk6PlsQvGYw=' 'sha256-/HLfvflMjGJfNWACtmeM8j985xMVxyR1fLmWYzg3xPs=' 'sha256-IFglbyngJ2kIeE41CVjdICsdoq8nnrKI0WKrLmEyiLY=' 'sha256-cv7HuQsgHFnTM7nCpiohsAup8X/fMQ5SJOGI0SKs5mc=' 'sha256-52UfK89BuAup+nwQESdYTAgEqrKxzGZC7jKMTR0tdho=' 'sha256-mTKa2f9NnduJ9f5CiFEUATEPOAkKPlVrXF/itRfN96g=' 'sha256-CCSklvsMrBa//Gte6OGcCiW0ZJZzW91TYOnHuVFi2LU=' 'sha256-gPM3F0gz0NQDSFAmoV73Gt6b5WY3FtPOKhlNIfQ5qvs=' 'sha256-2rN0G+pT+xCjPPtXrIE78Ry087qGpGvGVo8d1uhNmGY=' 'sha256-CB4/7KlaD6FZQ3wZgfTP+LJbeiHk2iVMLTZiaZU81Rs=' 'sha256-eF/gaAFt0oLquJIoIEvJT+foC/h2RKFsEe4iFEIy7Ng=' 'sha256-6FCOzO73y8p36bBvavdkMnWbxtFYRf4ox4kRRIP9A5w=' 'sha256-CCvFfdCBqcjvyhyB7smL2zSyksbOm0c8UrfcJj2TIbE=' 'sha256-zNLRbCnn04d+UXd2KzfV9w3nROo0qipJhkOLZvUgPXk=' 'sha256-61axK/0SND/r+Tk+QinMOoqbmWOmiDZCnZZmRR9jC5U='; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self' data: https://videos.pexels.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests
```

Diferencias vs. la CSP original en `_headers`:
- `script-src`: se quitan `'unsafe-inline'` y `'unsafe-eval'`; se añaden **16 hashes SHA-256**, uno por cada bloque `<script>` inline distinto del sitio (el detector `w-mod-js` + 15 bloques JSON-LD, uno por página). Se hashearon también los JSON-LD por precaución — no se asumió que `type="application/ld+json"` esté exento de CSP en todos los navegadores, ya que ese comportamiento no está garantizado por la especificación.
- `font-src`: se añadió `data:` — **hallazgo encontrado durante la verificación en navegador real**: `webfont.js` (Webflow) carga una fuente de fallback vía `data:` URI; sin este permiso, la fuente fallaba a cargar bajo CSP estricta.
- `media-src`: se mantiene `https://videos.pexels.com` explícito (ver H-04 — decisión consultada, se mantiene el video remoto en vez de auto-alojar 21MB).
- `style-src`: mantiene `'unsafe-inline'` (obligatorio por los cientos de `style="..."` inline que genera Webflow).

> Si se añade o modifica contenido con un nuevo `<script>` inline, hay que recalcular su hash y añadirlo a `SCRIPT_HASHES` en `server.mjs` — de lo contrario esa página lo bloqueará.

---

## Headers de seguridad — implementados

Los siguientes headers se sirven ahora en **todas** las respuestas vía `server.mjs` (verificado con `curl -I` en vivo):

```
Content-Security-Policy: <ver arriba>
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-XSS-Protection: 0
```
> El `_headers` original usaba `X-XSS-Protection: 1; mode=block`; se cambió a `0` (el filtro legacy tiene bugs de seguridad propios y la CSP lo reemplaza). Railway fuerza HTTPS/TLS automáticamente en el edge, pero HSTS se emite igualmente desde la app para instruir al navegador en visitas futuras.

---

## Servidor que sirve los headers (H-01, H-05) — implementado

`sirv-cli` no soporta headers custom, así que se reemplazó por `server.mjs` en la raíz del repo, usando la librería `sirv` (ahora dependencia directa en `package.json`). `package.json` → `"start": "node server.mjs"`.

Cache diferenciado implementado:
- `/_astro/*` y `/js/webflow.*` (con content-hash en el nombre) → `public, max-age=31536000, immutable`
- `*.html` → `no-cache`
- Resto (JS vendored sin hash: jquery, gsap, etc.) → `public, max-age=3600, must-revalidate`

Ver el archivo `server.mjs` en la raíz del repo para el código completo y actualizado.

**Verificación realizada:**
- `curl -I` contra el servidor real: los 6 headers presentes en `/`, cache diferenciado confirmado por tipo de ruta, `/_headers` devuelve 404.
- Chrome headless real (vía `puppeteer-core` + el binario de Chromium ya presente en el repo) navegando `/`, `/about`, `/work`, `/contact`, `/journal`, `/project/aether`: **0 violaciones CSP, 0 errores de consola, 0 errores de página** tras el fix de `font-src`.
- Captura visual de `/` confirmando renderizado correcto (imágenes, fuentes, layout, animación de entrada GSAP).

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `server.mjs` | **Nuevo.** Servidor Node que reemplaza `sirv-cli`, sirve headers de seguridad y cache diferenciado (H-01, H-03, H-05). |
| `package.json` | `start` ahora es `node server.mjs`; `sirv-cli` → `sirv` como dependencia directa. |
| `package-lock.json` | Regenerado para reflejar el cambio de dependencia. |
| `public/_headers` | **Eliminado** — inerte bajo sirv/Railway, reemplazado por `server.mjs` (H-06). |
| `src/pages/**/*.astro` (14 archivos) | `rel="noopener noreferrer"` añadido a los 55 `target="_blank"` (H-02). |
| `src/layouts/Layout.astro` | Eliminado el comentario `<!-- Built with Astro -->` (H-08). |
| `public/robots.txt` | Eliminada la línea `Sitemap:` que apuntaba a un recurso inexistente (H-11). |

**Sin cambios (por decisión consultada):** el video de Aether se mantiene en `https://videos.pexels.com`, con la CSP `media-src` ya restringida a ese host (H-04).

**Pendiente de decisión del usuario:** ninguno de los fixes anteriores toca `railway.json` ni requiere acción en Railway — HTTPS/TLS ya es automático en su edge. El `_headers` file era la única pieza que dependía de la plataforma de hosting; con `server.mjs` la configuración de headers ahora es portable a cualquier host que ejecute Node.
