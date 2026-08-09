# PERFORMANCE_REPORT — Circles website

> **Documento histórico — archivado.**
> Refleja la arquitectura anterior del sitio: proceso Node propio (`server.mjs`, sirv +
> compression) desplegado en Railway. Esa infraestructura ya no existe: el sitio se sirve
> desde **Firebase Hosting** y los formularios desde **Cloud Functions**.
> Las referencias a Railway, `railway.json`, `server.mjs`, `sirv` y `compression` que
> aparecen a continuación son parte del registro histórico y no describen el estado actual.
> La configuración vigente está en [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md).

Fecha: 2026-07-11. Mediciones locales (Lighthouse 13.4, emulación móvil con throttling, servidor `server.mjs` con compresión, Chrome 150 headless). Los valores absolutos locales no equivalen a campo, pero el antes/después es comparable (mismo entorno).

## Lighthouse (home)

| Categoría | Antes | Después |
|---|---|---|
| Performance | 74 | 74 |
| Accessibility | 92 | **97** |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

| Métrica | Antes | Después |
|---|---|---|
| FCP | 0.9 s | 0.9 s |
| LCP | 7.0 s | 6.9 s |
| TBT | 100 ms | 100 ms |
| CLS | 0.001 | 0.001 |
| Speed Index | 3.9 s | 3.8 s |

**Sobre el LCP (por qué Performance no sube de ~74):** el contenido principal se mantiene `visibility:hidden` hasta que el runtime de interacciones inicializa y el preloader completa su animación — es una decisión de diseño del sitio aprobado. El elemento LCP se revela tarde por construcción; FCP (0.9 s), TBT (100 ms) y CLS (0.001) son excelentes. Elevar Performance a 95+ exigiría acortar/eliminar el preloader o revelar el hero antes de la animación — cambios de diseño explícitamente fuera de alcance. Queda como decisión de producto documentada (ver Recomendaciones).

## Tamaños

| Medida | Antes | Después | Δ |
|---|---|---|---|
| `dist/` total | 32 MB | 30 MB | −2 MB (assets huérfanos) |
| `public/assets/` | 26 MB | 24 MB | −2.2 MB |
| CSS compilado (bundle único) | 114.5 KB | 100.5 KB | −12.3% (CSS muerto del framework) |
| CSS fuente | 102.8 KB / 5 687 líneas | 85.9 KB / 4 799 líneas | −16.5% |
| JS total en `dist/js` | 2 369 KB | 2 355 KB | −14.7 KB (scripts muertos) |
| JS cargado por página | ~2.0 MB sin comprimir (runtime interacciones + jQuery + GSAP) | igual | el runtime se conserva por paridad funcional (ver LEGACY_CLEANUP_REPORT §4) |
| HTML por página | ~60 KB | ~65 KB | +5 KB de hreflang×6 + grafo JSON-LD Organization/WebSite/Breadcrumb (payload SEO intencional) |

## Cambios de rendimiento aplicados

1. **Caché correcta para HTML** (bug): las URLs de directorio (`/es/about/`) recibían `max-age=3600`; ahora todo HTML es `no-cache` y los assets no hasheados de `/assets/` pasan de 1 h a 1 día. Assets hasheados siguen `immutable` 1 año. Sin doble compresión: Brotli/Gzip lo hace únicamente `compression` en el proceso Node (no hay CDN delante).
2. **`unsized-images` corregido**: dimensiones intrínsecas añadidas a las flechas del slider (`arrow.webp` 172×143) y `height` a los 3 iconos sociales del footer (512×512 → aspect 1:1).
3. **Ladder de srcset completado** para el hero del proyecto pulse (`work-3`): añadidos `-p-1600`/`-p-2000` (existían en disco sin referenciar; los demás proyectos ya usaban el ladder completo).
4. **−2.2 MB de assets muertos** fuera del repo/deploy y **−14 KB de CSS** por página.
5. Fuentes: se conservan WOFF2 self-hosted con `unicode-range` y los 4 preloads críticos existentes; eliminados los 4 TTF duplicados (622 KB) y el loader `webfont.js`. Las familias del ciclo tipográfico del preloader (Changa One/Oswald/Merriweather/IBM Plex Mono) se conservan — son parte del efecto visual.
6. Imágenes: sin recompresión automática (Sharp ya está en última versión; el pipeline existente de variantes `-p-NNN` se respeta). No se convirtió nada a AVIF: la ganancia sobre WebP no justifica el coste de build ni el riesgo visual aquí.

## Metodología de regresión visual

39 capturas (13 páginas × desktop/tablet/mobile, Chrome headless con presupuesto de tiempo virtual) antes y después; comparación con ImageMagick (`compare -metric AE -fuzz 8%`):
- 33/39 idénticas al píxel o <0.15%.
- 6 con diferencias, todas investigadas y atribuidas a **no-determinismo de captura**, no a regresión: los frames de los `<video>` autoplay (páginas project: el mismo build difiere ~50% consigo mismo entre ejecuciones) y el timing del preloader/lazy-load (about: el build baseline difiere 100% consigo mismo entre sus propias ejecuciones).
- Prueba concluyente: sirviendo baseline y refactor en paralelo y capturando en condiciones idénticas, `baseline vs refactor = 0 píxeles de diferencia`.
- El diff de HTML del body entre builds se limita a los cambios intencionales: wrapper `<main display:contents>`, `data-crcls-form`, atributos `height`/`width` añadidos.

## Recomendaciones futuras (no aplicadas por respeto a la paridad)

1. **Preloader**: decidir como producto si debe mostrarse solo en la primera visita por sesión (`sessionStorage`) — es la única palanca real para el LCP/Performance score.
2. Generar variantes responsive para `hero-photo-2.webp` (se sirve a 870×1267 para un render de ~450×600).
3. Ajustar `sizes` de las imágenes de testimonios (se declaran `100vw` y renderizan ~76px en móvil, ~200 KB evitables) — requiere validar el comportamiento del slider en todos los breakpoints.
4. Auto-hostear el vídeo de Pexels del proyecto aether.
5. Largo plazo: sustituir el runtime de interacciones (2 MB) por CSS/JS propio, interacción a interacción — la mayor reducción de JS posible del proyecto.
