# REFACTOR_PLAN — Circles website (circles-website)

Fecha: 2026-07-11 · Rama: `main` (árbol de trabajo con migración i18n sin commitear — se trata como estado aprobado actual)

## Baseline (Fase 0)

| Métrica | Valor |
|---|---|
| Build | PASS — 80 páginas, ~0.65 s |
| Typecheck | N/A — no existe `tsconfig.json` ni `astro check` |
| npm audit | 17 moderate, todas transitivas de `lighthouse → @sentry/node → @opentelemetry/*` (solo devDependencies) |
| Tamaño `dist/` | 32 MB |
| JS cliente | 2.37 MB sin comprimir (2.1 MB = runtime Webflow + jQuery; 133 KB GSAP; ~4.5 KB propio) |
| Lighthouse home (local, movil) | Perf 74 · A11y 92 · BP 100 · SEO 100 |
| LCP / TBT / CLS | 7.0 s / 100 ms / 0.001 |
| Screenshots de referencia | 39 capturas (13 páginas × 3 breakpoints) en scratchpad |

## Hallazgos principales (Fase 1)

### Críticos (bugs objetivos)
1. **SEO i18n roto en el head**: `Layout.astro` fija `lang="en"` y `og:locale=en_US` en los 5 idiomas, el canonical de toda página localizada apunta a la versión EN y no se emite ningún `hreflang`. `SEOHead.astro` y `StructuredData.astro` — que lo hacen bien — están huérfanos (0 imports). El sitemap sí emite hreflang correcto → señales contradictorias para Google.
2. **Props de Layout desalineadas**: los 9 templates pasan `locale` y `canonicalPath`; Layout no declara ninguna en `Props` (ignora `locale` por completo). Error de tipos latente.
3. **Sin typecheck**: no hay tsconfig; 4 casts `as any` en páginas dinámicas; 8 non-null assertions.

### Legado Webflow
- **Runtime Webflow (6 chunks + jQuery) SÍ está en uso**: IX2 (interacciones por `data-w-id`, ~50), menú móvil (`w-nav`), slider testimonios (`w-slider`), background-videos (`w-background-video`). **Decisión: se conserva como legado justificado** — reescribir las interacciones rompería la paridad visual/funcional (prohibido). Se documenta en LEGACY_CLEANUP_REPORT.
- **Muertos verificados**: `public/js/webfont.js` (0 refs), `public/js/i18n-locale.js` (0 refs — nunca se conectó), 4 `.ttf` duplicados de woff2 (622 KB), 29 imágenes/iconos huérfanos (~1.6 MB, incl. los 9 SVG de `public/assets/icons/`), `SEOHead.astro`* y `StructuredData.astro`* (*se reutilizan al integrarlos en Layout, no se borran).
- CSS: ~36% de `circles.shared.css` (líneas ~3–2059) es framework base Webflow; clases `w-tab*`, `w-lightbox*`, `w-container/w-row/w-col-*`, `w-file-upload-*` no aparecen en el DOM → eliminables con verificación selector-a-DOM. El resto de clases `w-*` en markup son load-bearing (runtime) → se conservan.
- Comentarios de procedencia Webflow en `posts.ts`, `projects.ts`, `AboutPage.astro`, `ButtonLink.astro` → se reescriben en términos neutrales/técnicos.
- Nomenclatura `crcls`: se aplica a lo propio (helpers nuevos, tokens, atributos `data-circles-*` → `data-crcls-*` solo si no rompe `forms.js`/CSS — renombrado atómico con sus referencias). **No** se renombran masivamente clases CSS heredadas (regla acordada).

### Arquitectura
- `getStaticPaths` idéntico repetido 7× (`[locale]/*.astro`) + 4 variantes en post/project → 2 helpers en `src/i18n/`.
- Diccionarios `{en,es,fr,de,pt}` importados a mano: 60 imports en HomePage, repetido en PostPage/ProjectPage/JournalPage → loader `import.meta.glob(..., { eager: true })` tipado.
- Exports muertos: `defaultLocaleHref`, `isLocale` (se usará en helpers nuevos), mitad de `seo.ts` solo lo usan los componentes huérfanos (vuelven a estar vivos al integrar SEOHead/StructuredData).
- HomePage: 3 bloques work-row duplicados → un loop.

### Servidor (server.mjs) — DECISIÓN: SE MANTIENE
No es un simple file-server: implementa `/api/contact` y `/api/subscribe` (Resend + rate-limit + honeypot + origin check), headers de seguridad y CSP con hashes, 404 por locale. El deploy real es Railway/NIXPACKS con proceso Node (`railway.json`) — no hay CDN delante que pueda asumir headers/compresión/API. Eliminar sirv/compression exigiría migrar a otra plataforma (fuera de alcance). Hardening pendiente: los 17 hashes CSP están hardcodeados → generarlos automáticamente desde `dist/` al arrancar (elimina drift al cambiar scripts inline).

### Seguridad
- Audit previo (SECURITY-AUDIT.md, 2026-07-09) ya implementó headers/CSP/anti-spam. Validar, no rehacer.
- `set:html` solo con `JSON.stringify` (JSON-LD): endurecer escapando `<` (`<`) para blindaje anti `</script>`.
- 17 vulns moderate = dev-only (lighthouse); no hay fix upstream (lighthouse ya está en última). Documentar como riesgo residual dev.
- Video externo `videos.pexels.com` (proyecto aether): tercero permitido en CSP; se documenta, recomendación futura self-host.

### Rendimiento
- LCP 7.0 s: el contenido se oculta (`visibility:hidden` hasta que IX2 inicializa) por el preloader — intrínseco al diseño; optimizar sin tocar el diseño: prioridad/preload correcto del LCP real, `sizes` correctos, imágenes `unsized` (fix), `image-delivery` (208 KB), CSS no usado (13 KB).
- Fuentes: preloader cicla Changa One/Oswald/Merriweather → esas familias se quedan. Solo se eliminan los 4 TTF.

### i18n/SEO/GEO (pendiente informe agente; confirmado hasta ahora)
- Corregir: `<html lang>` por locale, canonical localizado, hreflang completo + x-default, og:locale por idioma (integrando SEOHead en Layout).
- `i18n-locale.js`: si se conecta tal cual, Googlebot (en-US) sería redirigido fuera de `/es/...` → desindexación. Decisión: conectarlo **restringido a páginas del locale por defecto** (nunca redirige fuera de una URL localizada explícita) o eliminarlo. Se decidirá al implementar Fase 8 y se documentará.
- JSON-LD: falta Organization/WebSite global (existe en StructuredData.astro huérfano) → integrarlo.

### Accesibilidad (baseline home)
Fallos: `aria-prohibited-attr`, `link-name`, `landmark-one-main`. Corregir sin tocar diseño (p. ej. `<main>` semántico conservando clases).

## Orden de ejecución y validación

| Fase | Cambios | Validación |
|---|---|---|
| 3 Dependencias | astro→7.0.7; quitar `wawoff2` (sin uso); añadir `typescript@^6` + `@astrojs/check` + tsconfig strict; scripts `typecheck`/`audit` | build + `astro check` |
| 4 Legado | borrar muertos verificados (webfont.js, ttf, orphans); reescribir comentarios; decidir i18n-locale.js | build + grep exhaustivo + visual |
| 5 Arquitectura | helpers paths/i18n loader; fix Props; quitar `as any` | build + typecheck + diff HTML dist |
| 6 Seguridad | CSP hashes autogenerados; endurecer JSON-LD; validar headers | curl headers + arranque server |
| 7 Rendimiento | unsized images, sizes/srcset, preloads | Lighthouse comparativo |
| 8 i18n/SEO | SEOHead+StructuredData en Layout; lang/canonical/hreflang | grep dist + sitemap check |
| 9 A11y | landmarks, link-name, aria | Lighthouse a11y |
| 10 QA | build/typecheck/links/sitemap/visual-diff/Lighthouse | criterios de aceptación |

**Regla de paridad**: tras Fases 4, 5 y 9 se recapturan los 39 screenshots y se comparan con ImageMagick (`compare -metric AE`, umbral por animaciones). El HTML de `dist/` se diffea contra baseline para detectar cambios no intencionados.

**Rollback conceptual**: cambios en fases con working tree limpio verificable vía `git diff`; no se hacen commits automáticos; `dist/` baseline se conserva en `dist-baseline/` (fuera de git) hasta el QA final.
