# REFACTOR_REPORT — Circles website (circles-website)

> **Documento histórico — archivado.**
> Refleja la arquitectura anterior del sitio: proceso Node propio (`server.mjs`, sirv +
> compression) desplegado en Railway. Esa infraestructura ya no existe: el sitio se sirve
> desde **Firebase Hosting** y los formularios desde **Cloud Functions**.
> Las referencias a Railway, `railway.json`, `server.mjs`, `sirv` y `compression` que
> aparecen a continuación son parte del registro histórico y no describen el estado actual.
> La configuración vigente está en [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md).

Fecha: 2026-07-11 · Astro 7.0.7 · `output: 'static'` · 80 páginas · 5 idiomas (en/es/fr/de/pt)

## Resumen ejecutivo

Refactorización integral sin cambio de diseño ni de comportamiento: se corrigió el bug SEO más grave del sitio (todas las páginas localizadas se canonicalizaban a la versión inglesa, con `lang="en"` fijo y sin hreflang), se activó typecheck estricto de TypeScript (0 errores), se eliminaron ~2.2 MB de assets muertos y ~17 KB de CSS de framework heredado, se endureció el servidor (CSP con hashes autogenerados, caché HTML corregida) y se redujo la duplicación estructural (−1 143 líneas netas de código fuente; 57 archivos, +2 516/−3 659). Paridad visual verificada píxel a píxel. Estado final: **READY FOR PRODUCTION**.

## Estado inicial

- Build PASS (80 páginas), pero sin tsconfig ni typecheck; 4 casts `as any`, 8 non-null assertions, Props de Layout desalineadas con sus 9 llamadores.
- Dos sistemas SEO paralelos: `SEOHead.astro` y `StructuredData.astro` (correctos, con hreflang/canonical localizado/grafo Organization) estaban **huérfanos**; el head real (`Layout.astro`) emitía `lang="en"`, `og:locale=en_US` y canonical inglés en los 5 idiomas, sin hreflang y descartando `noindex` silenciosamente. 60 referencias JSON-LD a `#business`/`#website` colgaban sin definición.
- 60 imports de JSON de locales solo en HomePage (patrón repetido en 4 templates); `getStaticPaths` idéntico duplicado 11×.
- Legado: 2 scripts JS muertos, 33 assets huérfanos, 149 bloques de CSS de framework sin match en el DOM, comentarios de procedencia, directorio basura de 6.2 MB.
- Lighthouse home: Perf 74 · A11y 92 · BP 100 · SEO 100 (con el SEO técnico i18n roto de facto — el 100 era engañoso al nivel de página individual).

## Arquitectura encontrada y conservada

`src/pages/*` (wrappers finos) → `src/templates/*` (markup real) → `src/layouts/Layout.astro` (único `<html>`), con datos en `src/data/`, copy por idioma en `src/i18n/locales/<ns>/<locale>.json` y runtime de interacciones exportado en `public/js/`. La arquitectura es sana; el trabajo fue eliminar deuda dentro de ella, no reemplazarla.

## Cambios realizados

**SEO/i18n (Fase 8)** — `Layout.astro` integra ahora `SEOHead` + `StructuredData`: `<html lang>` por locale, canonical localizado autorreferente con trailing slash (consistente con sitemap), hreflang completo (5 + x-default, absolutos), `og:locale`/alternates por idioma, `robots noindex` operativo (404s), grafo JSON-LD `ProfessionalService`/`WebSite`/`BreadcrumbList` en todas las páginas (resuelve las 60 referencias `@id` colgantes), URLs JSON-LD absolutas y localizadas, `og:type=article` en posts. El sitemap custom se conserva (correcto y necesario para el control i18n; una integración genérica no aporta).

**Arquitectura (Fase 5)** — Nuevo `src/i18n/dictionaries.ts` (`import.meta.glob` eager tipado por anclaje al JSON inglés): elimina ~150 líneas de imports repetidos y hace que un archivo de locale ausente **rompa el build**. Helpers `secondaryLocalePaths`/`slugPaths`/`localeSlugPaths` con `props` tipadas: 11 `getStaticPaths` duplicados → 3 helpers, 0 `as any`. `requirePost`/`requireProject` sustituyen los `getX()!`. Las 3 filas de work de la home colapsadas en un loop con datos. `zipByIndex` con fail-fast para los pares copy/ids de About. Eliminados los exports muertos (`defaultLocaleHref`) y reactivada la mitad "muerta" de `seo.ts`.

**Tipos (Fase 3)** — `tsconfig.json` (extends `astro/tsconfigs/strict` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`), `@astrojs/check` + TypeScript 6.0.3 (TS 7 aún no es compatible con el peer range de @astrojs/check). `astro check`: **0 errores, 0 warnings**. Sin `any`, sin `@ts-ignore`, sin non-null assertions.

**Legado (Fase 4)** — ver `LEGACY_CLEANUP_REPORT.md`. Resumen: 35 archivos muertos eliminados (~2.2 MB), 149 reglas CSS podadas con verificación selector→DOM→runtime, comentarios de procedencia reescritos, namespace `crcls` aplicado a los identificadores propios (`crcls.shared.css`, `data-crcls-form`, `crcls-locale`), runtime de interacciones conservado como legado justificado y documentado.

**Seguridad (Fase 6)** — ver `SECURITY_REPORT.md`. CSP con hashes derivados del build al arrancar (0 drift), bug de caché HTML corregido, `jsonLdString()` anti-`</script>`, 0 vulnerabilidades en dependencias de producción.

**Rendimiento (Fase 7)** y **Accesibilidad (Fase 9)** — ver `PERFORMANCE_REPORT.md`. A11y 92→97 (landmark `<main>` en las 9 plantillas —`display:contents`, sin efecto en layout—, `aria-label` en las cards-enlace de proyectos, imágenes con dimensiones). El fallo restante (`aria-prohibited-attr`) lo inyecta SplitText en runtime al trocear texto — no corregible desde el markup sin tocar la librería de animación.

**Calidad/automatización (Fase 19 del prompt)** — Scripts: `typecheck`, `audit`, `check` (nuevo `scripts/check-site.mjs`, sin dependencias: valida por build links internos, assets locales, srcset, canonicals autorreferentes, sets hreflang completos y resolubles, `<html lang>` vs URL, un `<main>` por página, JSON-LD parseable y sitemap ↔ páginas 1:1). No se añadió ESLint ni suite de tests: el typecheck estricto de Astro cubre `.ts`/`.astro`, y `check` cubre la integridad del sitio; más tooling sería mantenimiento sin valor proporcional en un proyecto de este tamaño (decisión documentada; `lint`/`test` quedan N/A).

## Dependencias

| Acción | Paquete | Nota |
|---|---|---|
| Actualizado | astro 7.0.6 → 7.0.7 | patch |
| Eliminado | wawoff2 | devDep sin uso |
| Añadido (dev) | typescript ^6.0.3, @astrojs/check ^0.9.9 | typecheck |
| Sin cambios | sharp 0.35.3, lighthouse 13.4.0, compression 1.8.1, sirv 3.0.2 | ya en última estable |

Vulnerabilidades: 0 critical, 0 high. 17 moderate **solo-dev** (cadena lighthouse→sentry→opentelemetry, sin fix upstream; documentadas).

## Decisión sobre server.mjs — SE MANTIENE

No es un file-server prescindible: implementa `/api/contact` y `/api/subscribe` (Resend, rate-limit, honeypot, verificación de Origin), los security headers y el 404 por locale. El deploy real (Railway/NIXPACKS, `npm start`) no tiene CDN delante que pueda asumir nada de eso. Se endureció (CSP autogenerada, caché corregida) en lugar de eliminarse. Si algún día se migra a hosting estático con CDN, el camino está documentado en `SECURITY_REPORT.md` §6.

## Riesgos pendientes

1. Runtime de interacciones (~2 MB JS) conservado por paridad — deuda técnica consciente, ruta de salida documentada.
2. Performance ~74 acotado por el preloader (decisión de diseño); palancas documentadas en PERFORMANCE_REPORT.
3. `style-src 'unsafe-inline'`; vídeo externo de Pexels; datos de negocio del JSON-LD pendientes de verificación por el propietario.
4. localStorage pasó de `circles-locale` a `crcls-locale`: los visitantes previos al deploy pierden la preferencia guardada una vez (impacto mínimo pre-lanzamiento).

## Recomendaciones futuras

Ver PERFORMANCE_REPORT (preloader por sesión, variantes de hero-photo-2, sizes de testimonios, self-host del vídeo Pexels, sustitución progresiva del runtime) y SECURITY_REPORT (endurecer style-src, Dependabot/Renovate + un workflow de CI con `build`+`typecheck`+`check` si el repo pasa a GitHub — no se añadió al no haber remoto configurado).

## Validación final

| Check | Resultado |
|---|---|
| `npm run build` | PASS — 80 páginas |
| `npm run typecheck` | PASS — 0 errores, 0 warnings |
| `npm run check` (links/assets/hreflang/canonical/sitemap/JSON-LD) | PASS — 0 fallos |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| Regresión visual (39 capturas × A/B controlado) | PASS — 0 px de diferencia en condiciones idénticas |
| Lighthouse home | 74 / **97** / 100 / 100 |
| Servidor (headers, CSP, 404 por locale, formularios) | PASS (verificado con curl) |
