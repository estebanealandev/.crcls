# LEGACY_CLEANUP_REPORT — Circles website

Fecha: 2026-07-11. Alcance: eliminación de legado Webflow/plantilla y migración de nomenclatura propia al namespace `crcls`.

## 1. Inventario de legado encontrado

Auditoría exhaustiva de `src/`, `public/` y raíz (excluyendo `dist/`, `node_modules/`, `chrome/`):

| Categoría | Hallazgo | Resolución |
|---|---|---|
| Scripts runtime | 6 chunks `webflow.*.js` + `jquery-3.5.1.min.js` (2.0 MB) | **Conservados (justificado)** — ver §4 |
| Scripts muertos | `public/js/webfont.js` (13 KB, 0 refs), `public/js/i18n-locale.js` (1.5 KB, 0 refs, nunca conectado) | **Eliminados** |
| Fuentes | 4 `.ttf` duplicados de woff2 en uso (622 KB) | **Eliminados** |
| Imágenes huérfanas | 20 archivos (~1.5 MB): `Vintage-Lace-Portrait.jpg`, `Futuristic-Robotic-Dragon.webp`, 10 `logo-*` sin uso, `close/pause/play/lightning.png`, `logo-big/small` | **Eliminados** (verificado: 0 refs en src, public/js y JSON de locales) |
| Iconos | `public/assets/icons/` completo — 9 SVG (40 KB), 0 refs (la home usa SVG inline) | **Eliminado** |
| CSS framework | 149 bloques de reglas de clases sin ningún match en el DOM generado ni inyección por runtime: `w-tab*`, `w-lightbox*`, `w-container/w-row/w-col-*`, `w-file-upload/checkbox/radio/select`, `w-video`, `w-icon-*` + @font-face `webflow-icons` (data-URI), `.w-webflow-badge` | **Eliminados** — `crcls.shared.css` 102.8 KB → 85.9 KB (−16.5%), 5 687 → 4 799 líneas |
| Atributo typo | `tittle=""` y `loading="eager"` (inertes) en `<video>` de WorkCard | **Eliminados** |
| Comentarios de procedencia | "Webflow export/template" en `posts.ts`, `projects.ts`, `AboutPage.astro`, `ButtonLink.astro` | **Reescritos** en términos técnicos neutrales |
| Directorio basura | `C:\Users\esteb\...\lighthouse.*` (6.2 MB, perfil de Chrome creado por Lighthouse en Windows) | **Eliminado** + regla en `.gitignore` |
| `data-wf-site` / badge visible / metadata de generador | No presentes | N/A |

Copia de seguridad de todo lo eliminado en el scratchpad de la sesión (`removed-backup/`) — los archivos trackeados además son recuperables vía git.

Nota sobre `i18n-locale.js`: implementaba auto-redirect por idioma del navegador, pero nunca se cargó desde ningún layout, y activarlo tal cual habría hecho que Googlebot (en-US) fuese redirigido fuera de `/es|fr|de|pt/...` una vez corregido `<html lang>` (desindexación de los 4 idiomas). Se elimina como código muerto; el selector de idioma (`language-switcher.js`) cubre el caso de uso. Si se quisiera reintroducir, hacerlo solo en la raíz del locale por defecto y nunca redirigiendo fuera de una URL localizada explícita.

## 2. Migración de nomenclatura a `crcls`

Renombrados atómicos (definición + todas las referencias, verificado con grep posterior):

| Antes | Después | Archivos |
|---|---|---|
| `src/styles/circles.shared.css` | `src/styles/crcls.shared.css` | + import en `Layout.astro` |
| `data-circles-form` | `data-crcls-form` | `ContactForm.astro`, `SubscribeForm.astro`, `public/js/forms.js` |
| localStorage `circles-locale` | `crcls-locale` | `public/js/language-switcher.js` |

No se renombraron masivamente las clases CSS heredadas (`w-*`, ni las clases visuales del design system) — regla acordada: `crcls` se aplica a namespaces propios; un renombrado global de miles de clases produciría riesgo de regresión sin beneficio proporcional.

## 3. Elementos renombrados/eliminados — totales

- Archivos eliminados: **35** (2 JS + 4 TTF + 20 imágenes + 9 iconos) ≈ **2.2 MB** + 6.2 MB de basura de tooling.
- Reglas CSS eliminadas: **149 bloques** (~17 KB).
- Renombres `crcls`: **3 identificadores** (5 archivos tocados).
- Comentarios de procedencia reescritos: **4 archivos**.

## 4. Excepciones justificadas (legado que permanece)

El sitio depende del runtime de interacciones exportado para: animaciones IX2 (~50 `data-w-id`), menú móvil (`w-nav` + lottie), slider de testimonios (`w-slider`), background-videos (`w-background-video`), sistema de variantes (`data-wf-component-id`/`data-wf-variant-state` — el chunk `webflow.schunk.1f640fbb...` los lee en runtime, verificado). Por tanto se conservan:

- `public/js/webflow.*.js` (6 chunks) y `jquery-3.5.1.min.js` (dependencia del runtime; ningún código propio usa jQuery).
- Clases `w-*` funcionales en markup (`w-nav*`, `w-slider*`, `w-form*`, `w-input`, `w-button`, `w-inline-block`, `w-dyn-*`, `w-background-video*`, `w-embed`, `w-richtext`, `w--current`) y su CSS.
- Atributos `data-w-id`, `data-wf-page`, `data-wf-ignore`, `data-wf--*` (consumidos por el runtime).
- El IIFE `w-mod-js`/`w-mod-touch` y las reglas críticas anti-FOUC en `Layout.astro` (gobiernan el primer paint).
- La regla que oculta `.w-webflow-badge` en Layout (defensiva: el runtime podría inyectar el badge).
- GSAP (`gsap.min.js`, `ScrollTrigger`, `SplitText`, `CustomEase`): no es legado Webflow — anima el preloader y los scroll effects.

Sustituir este runtime exigiría reimplementar todas las interacciones, rompiendo la paridad visual/funcional exigida. Queda documentado como deuda técnica consciente; la ruta de salida futura es migrar interacción a interacción a CSS/JS propio.

## 5. Verificación final

- `grep -riE "webflow"` en `src/` + `server.mjs`: las únicas ocurrencias son rutas a los 6 chunks del runtime (justificadas arriba). Cero comentarios, cero branding, cero metadata de generador.
- `git grep` de los identificadores antiguos (`data-circles-form`, `circles-locale`, `circles.shared`): 0 resultados.
- Build (80 páginas), typecheck (0 errores) y `npm run check` (links/assets/sitemap) en verde tras la limpieza.
- Paridad visual: capturas A/B baseline↔refactor bajo condiciones idénticas → 0 píxeles de diferencia (ver PERFORMANCE_REPORT §Metodología).
